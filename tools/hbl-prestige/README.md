# HBL Prestige — 3D card film

The source of `media/films/hbl-prestige.mp4`: a 23.5-second, 1080p30 3D product film of the HBL Prestige World Elite debit card, front and back. It's an unofficial concept piece, like the Bugatti film.

Everything is code. The film is a three.js scene rendered frame by frame in headless Chromium, so any shot, light, word or digit on the card can be changed and the film rebuilt.

| File | What it is |
| --- | --- |
| `film.html` | Loads the film. Serve this folder and call `renderFrame(t)` in the console to see any moment |
| `src/shots.js` | The edit: which shot plays when |
| `src/shots/` | The 13 shots, one scene and camera move each |
| `src/card.js` | The card: artwork for both faces, the metal body, the chip and the copper HBL wordmark |
| `src/post.js` | The lens: depth of field, bloom, tone mapping, grade, grain |
| `src/studio.js` | Soft-box lighting and backdrops |
| `render.js` | Renders frames with Playwright |
| `synth.py` | The original score and every sound effect, timed to the cuts |
| `build.sh` | Runs all of it and writes the MP4 and its poster |
| `fonts/` | Open Sans, Barlow, Barlow Condensed and Poppins, from Google Fonts (SIL Open Font License) |

## Rebuild

```sh
npm i playwright && npx playwright install chromium
pip install numpy scipy soundfile
tools/hbl-prestige/build.sh
```

`build.sh` installs three.js into this folder on first run. Work files go in `tools/hbl-prestige/build/`, which git ignores.

It takes about 40 minutes on 4 CPU cores. The film renders on Chromium's software GPU (SwiftShader), so it looks the same on any machine. `SIZE=1920x1080 tools/hbl-prestige/build.sh` skips the supersampling and takes about half as long.

`tools/hbl-prestige/build.sh encode` redoes only the last step, encoding the frames and soundtrack already in the work folder, in about a minute.

## Changing things

- **Name on the card:** `name` in `frontArtwork` in `src/card.js`. It's set to AHMAR SAFDAR to match the portfolio; the design said AHMER.
- **Number, expiry, CVV and the rest of the print:** `frontArtwork` and `backArtwork` in `src/card.js`, laid out in millimetres on an ISO card (85.60 × 53.98 mm).
- **Timing:** `TIMELINE` in `src/shots.js`. From 0:06.1 the cuts land every two beats of the 128 BPM score. If you move a cut, move its time at the top of `synth.py` too.
- **Look of a shot:** its `update()` returns the lens settings (focus, aperture, exposure, contrast, fade).
- **Music:** to use a licensed track instead, put it in place of `mix.wav` in the work folder and run `build.sh encode`.

## How it was designed

It was reverse-engineered from Revolut's 22-second "Visual Exploration" card film, then rebuilt around the HBL Prestige card design.

**What the reference does:** black and steel only, macro lenses with very shallow focus, soft boxes reflected in lacquer, raw material becoming the card, and the cuts locked to the music.

| Reference | | This film | |
| --- | --- | --- | --- |
| 0:00 | Macro raw stone; the light comes up at 2.3 s | 0:00 | Macro dark stone; the key light swells on the sub hit at 2.3 s |
| 0:04 | Liquid metal wells out of the rock | 0:04.3 | Two drops of black liquid metal well out of the rock |
| 0:06 | Droplets spread and merge in a void | 0:06.1 | They spread, merge and settle into the exact outline of the card |
| 0:07 | Dark silk | 0:07.0 | Dark liquid satin, sharp folds relaxing into swells |
| 0:08 | Brushed chip contacts lock together | 0:08.0 | The card's own six-pad chip locks together |
| 0:09 | The chip sinks into a soft surface | 0:08.9 | Same |
| 0:10 | Logo and chip, raking light | 0:09.9 | The copper HBL Prestige wordmark, chip and contactless mark |
| 0:11 | Network logo at a grazing angle | 0:10.8 | The Mastercard corner |
| 0:12 | A fan of four metal cards | 0:11.7 | Front and back, fanned |
| 0:13.6 | Two cards crossing | 0:13.6 | Front and back crossing |
| 0:15 | The face, a light sweep across it | 0:15.0 | Same |
| 0:17 | The card floating over a pool of light | 0:17.0 | Same, with a glint crossing the face |
| 0:20.5 | Wordmark on black | 0:20.6 | The HBL Prestige wordmark in solid copper |

**What changed and why:**

- The four-colour fan became a front-and-back pair, so the back of the card gets screen time too.
- Copper is the only colour, as on the card. Everything else stays black and steel, so the logo carries the brand.
- The artwork was cleaned up for print: "massercord" is now "mastercard", "LAST 4 DIGIES: 111" is "LAST 4 DIGITS: 1111", "Tiems and Conditions appy" is "Terms and Conditions apply", and the layout was refitted to a real card shape.
- The HBL letters were measured from the artwork and rebuilt as solid shapes, keeping their quirks: the H crossbar and the B's middle bar stop short of the stem, and the L's foot is cut on a slant.
- The score is original but follows the reference's structure: a dark drone, a sub hit when the light comes on, a riser into an impact at 0:06.1, a 128 BPM pulse that cuts every two beats, a drop to air for the hero card, and a soft resolve under the logo.

**Rendering notes:** frames are rendered at 2560×1440 and scaled to 1080p so the chip's bevels and the small print don't shimmer. Anisotropic texture filtering is off because SwiftShader returns wrong samples with it on. The MP4 is H.264 at CRF 21 capped at 6 Mbps, which comes out near 4 Mbps (12 MB). That matched an 8 Mbps encode in side-by-side crops; from CRF 23 the grain on the dark card face starts to mottle.
