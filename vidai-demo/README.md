# Vid.AI product film

A 33.5-second 3D SaaS product film for [vid.ai](https://vid.ai), in the style of the
Sendaway demo: kinetic type on black, glossy 3D devices with brand-colored clay icons,
and the app UI floating as a glass slab that spins to change state.

Everything is code. `scene.js` poses every layer as a pure function of time
(`renderAt(t)`), and `render.mjs` steps through it frame by frame in headless Chromium.

## Structure

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | Frame layers and the glass-slab app UI (five states) |
| `scene.js` | Timeline: kinetic type, logo build, Three.js hero (phone, laptop, icons), slab camera, UI state, cursor |
| `render.mjs` | Serves the folder, renders stills or the full frame sequence, averages motion-blur sub-frames |
| `tools/blend.py` | Averages the sub-frames rendered for fast moves |
| `tools/soundtrack.py` | Synthesizes the ~100 BPM bed and the SFX, timed to the picture |
| `assets/` | Vid.AI logo and style sample images from vid.ai |

## Beats

| Time (s) | Shot |
| --- | --- |
| 0.0–4.4 | "Making videos takes hours." / "Not" / "anymore." / "Meet" / logo build |
| 4.4–7.4 | Phone spins in with the generated Short playing, icons pop out |
| 7.4–9.8 | Phone spins edge-on, laptop opens out of the spin, camera dives into the screen |
| 9.8–19.4 | Glass slab: prompt typed, Short, 60s, narrator, Cinematic style, Generate |
| 19.4–23.4 | Flip to generating checklist, then the finished video and export |
| 23.4–26.4 | Flip to posting, cut with rack focus to "Your Short is live" |
| 26.4–33.5 | "Vid.AI" / "Your next video is one prompt away." / vid.ai / logo |

## Render

Needs Node 18+, Playwright with Chromium, Python 3 with numpy and Pillow, and ffmpeg.

```sh
npm install
node render.mjs --stills 1,6,11,22       # review frames -> out/stills
node render.mjs                          # all frames -> out/frames
python3 tools/soundtrack.py out/soundtrack.wav
ffmpeg -framerate 30 -i out/frames/f%05d.jpg -i out/soundtrack.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -c:a aac -b:a 192k -shortest out/vidai-demo.mp4
```

The timing tables at the top of `SLAB`, `CUR` and `CLICKS` in `scene.js` drive the camera
and the cursor; the cue lists in `tools/soundtrack.py` use the same times.
