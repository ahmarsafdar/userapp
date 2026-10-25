#!/usr/bin/env bash
# Rebuilds media/films/intro-reel.mp4 and its poster from the films in media/films.
# Needs: ffmpeg, Node with Playwright (Chromium), Python 3 with numpy, scipy, soundfile and kokoro-onnx.
# VO=off builds it without the voiceover; VO_FILE=recording.wav uses your own voice instead of the AI one.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-$HERE/build}"
FPS=60
DUR=46
WORKERS="${WORKERS:-4}"

mkdir -p "$WORK/clips" "$WORK/frames"
cp "$HERE/intro.html" "$HERE/render.js" "$WORK/"
cp -r "$HERE/fonts" "$WORK/"
cp "$ROOT/media/portrait.jpg" "$WORK/"

echo "1/4 Cutting footage into frames"
grep -v '^#' "$HERE/clips.txt" | while read -r id src ss dur w; do
  mkdir -p "$WORK/clips/$id"
  ffmpeg -v error -y -ss "$ss" -t "$dur" -i "$ROOT/media/films/$src.mp4" \
    -vf "fps=30,scale=$w:-2:flags=lanczos" -q:v 3 "$WORK/clips/$id/%04d.jpg" < /dev/null
done
python3 -c "
import os, json, sys
d = sys.argv[1]
print('window.CLIPS = ' + json.dumps({c: len(os.listdir(os.path.join(d, c))) for c in sorted(os.listdir(d))}) + ';')
" "$WORK/clips" > "$WORK/clips.js"

echo "2/4 Rendering frames"
TOTAL=$((DUR * FPS))
PER=$(((TOTAL + WORKERS - 1) / WORKERS))
for ((w = 0; w < WORKERS; w++)); do
  FROM=$((w * PER)); TO=$(((w + 1) * PER)); ((TO > TOTAL)) && TO=$TOTAL
  node "$WORK/render.js" "$WORK/frames" "$FPS" "$FROM" "$TO" &
done
wait

echo "3/4 Making the soundtrack"
python3 "$HERE/synth.py" "$WORK"
MIX="$WORK/mix.wav"
if [ "${VO:-on}" != "off" ]; then
  if [ -z "${VO_FILE:-}" ] && [ ! -f "$WORK/tts/kokoro-v1.0.onnx" ]; then
    mkdir -p "$WORK/tts"
    for f in kokoro-v1.0.onnx voices-v1.0.bin; do
      curl -sSL -o "$WORK/tts/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
    done
  fi
  python3 "$HERE/vo.py" "$WORK" ${VO_FILE:+"$VO_FILE"}
  MIX="$WORK/mix_vo.wav"
fi

echo "4/4 Encoding"
# two-pass loudness so the mix is turned up or down as a whole, not pumped
LN="I=-14:TP=-1.5:LRA=11"
MEASURED=$(ffmpeg -hide_banner -i "$MIX" -af "loudnorm=$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p' |
  python3 -c "import json, sys; d = json.load(sys.stdin); print('measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s' % (d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset']))")
ffmpeg -v error -y -framerate "$FPS" -i "$WORK/frames/%05d.jpg" -i "$MIX" \
  -filter_complex "[0:v]format=yuv420p[v];[1:a]loudnorm=$LN:$MEASURED:linear=true,aresample=48000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 22 -maxrate 6M -bufsize 12M -profile:v high \
  -c:a aac -b:a 192k -movflags +faststart -shortest "$ROOT/media/films/intro-reel.mp4"
ffmpeg -v error -y -ss 7.82 -i "$ROOT/media/films/intro-reel.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 4 \
  "$ROOT/media/posters/intro-reel.jpg"
echo "Done: media/films/intro-reel.mp4"
