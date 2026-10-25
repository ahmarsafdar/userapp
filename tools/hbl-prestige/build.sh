#!/usr/bin/env bash
# Rebuilds media/films/hbl-prestige.mp4 and its poster.
# Needs: ffmpeg, Node with Playwright (Chromium), Python 3 with numpy, scipy and soundfile.
# SIZE=1920x1080 renders without supersampling (about twice as fast, slightly rougher edges).
# "build.sh encode" skips rendering and the score, and re-encodes the frames and mix.wav already in the work folder.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
WORK="${WORK:-$HERE/build}"
FPS=30
FRAMES=705 # 23.5 s
SIZE="${SIZE:-2560x1440}" # rendered above 1080p and scaled down, for clean edges on the chip and type
WORKERS="${WORKERS:-2}"

cd "$HERE"
if [ "${1:-}" != encode ]; then
  [ -d node_modules/three ] || npm ci --no-audit --no-fund
  mkdir -p "$WORK/frames"

  echo "1/3 Rendering frames"
  PER=$(((FRAMES + WORKERS - 1) / WORKERS))
  PIDS=()
  for ((w = 0; w < WORKERS; w++)); do
    FROM=$((w * PER)); TO=$(((w + 1) * PER)); ((TO > FRAMES)) && TO=$FRAMES
    SIZE="$SIZE" node "$HERE/render.js" "$WORK/frames" "$FPS" "$FROM" "$TO" &
    PIDS+=($!)
  done
  # waited on one by one, so a crashed worker stops the build instead of encoding a film with frames missing
  for pid in "${PIDS[@]}"; do wait "$pid"; done

  echo "2/3 Making the soundtrack"
  python3 "$HERE/synth.py" "$WORK"
fi

echo "3/3 Encoding"
# two-pass loudness so the mix is turned up or down as a whole, not pumped
LN="I=-14:TP=-1.5:LRA=11"
MEASURED=$(ffmpeg -hide_banner -i "$WORK/mix.wav" -af "loudnorm=$LN:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p' |
  python3 -c "import json, sys; d = json.load(sys.stdin); print('measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s' % (d['input_i'], d['input_tp'], d['input_lra'], d['input_thresh'], d['target_offset']))")
# CRF 21 capped at 6 Mbps comes out near 4 Mbps (about 12 MB). From CRF 23 the grain on the dark card face starts to mottle.
ffmpeg -v error -y -framerate "$FPS" -i "$WORK/frames/%05d.jpg" -i "$WORK/mix.wav" \
  -filter_complex "[0:v]scale=1920:1080:flags=lanczos,format=yuv420p[v];[1:a]loudnorm=$LN:$MEASURED:linear=true,aresample=48000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 21 -maxrate 6M -bufsize 12M -profile:v high -tune film \
  -c:a aac -b:a 192k -movflags +faststart -shortest "$ROOT/media/films/hbl-prestige.mp4"
ffmpeg -v error -y -ss 19.05 -i "$ROOT/media/films/hbl-prestige.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 4 \
  "$ROOT/media/posters/hbl-prestige.jpg"
echo "Done: media/films/hbl-prestige.mp4"
