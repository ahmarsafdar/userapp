#!/usr/bin/env bash
# Rebuilds media/films/intro-reel.mp4 and its poster from the films in media/films.
# Needs: ffmpeg, Node with Playwright (Chromium), Python 3 with numpy, scipy and soundfile.
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

echo "4/4 Encoding"
ffmpeg -v error -y -framerate "$FPS" -i "$WORK/frames/%05d.jpg" -i "$WORK/mix.wav" \
  -filter_complex "[0:v]format=yuv420p[v];[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -preset slow -crf 22 -maxrate 6M -bufsize 12M -profile:v high \
  -c:a aac -b:a 192k -movflags +faststart -shortest "$ROOT/media/films/intro-reel.mp4"
ffmpeg -v error -y -ss 7.82 -i "$ROOT/media/films/intro-reel.mp4" -frames:v 1 -vf scale=1280:-2 -q:v 4 \
  "$ROOT/media/posters/intro-reel.jpg"
echo "Done: media/films/intro-reel.mp4"
