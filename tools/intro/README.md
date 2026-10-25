# Intro reel

The source of `media/films/intro-reel.mp4`: a 46-second, 1080p60 motion-graphics intro built from the films in `media/films`. The hero's "Watch my intro" buttons play it.

Everything is code, so any text, colour, timing or clip can be changed and the video rebuilt.

| File | What it is |
| --- | --- |
| `intro.html` | The animation: 12 scenes driven by one timeline. Open it in a browser and call `renderFrame(t)` to see any moment |
| `clips.txt` | Which part of which film each shot uses (`id  film  start  length  width`) |
| `render.js` | Renders frames of `intro.html` with Playwright |
| `synth.py` | The original 120 BPM music and every sound effect, timed to the cuts |
| `build.sh` | Runs all of it and writes the MP4 and its poster |

## Rebuild

```sh
npm i playwright && npx playwright install chromium
pip install numpy scipy soundfile
tools/intro/build.sh
```

It takes about 5 minutes on 4 cores. Work files go in `tools/intro/build/`, which git ignores.

## Changing things

- **Words:** edit the text in `intro.html`. The site's look comes from the colour variables at the top of its `<style>`.
- **Timing:** each scene is a `scene(id, start, end, layer, fn)` call. Cuts and pops land on the 120 BPM beat grid (every 0.5 s); move the matching cue in `synth.py` if you move a beat.
- **Footage:** change a line in `clips.txt`, then the id it uses in `intro.html`.
- **Music:** to use a licensed track instead, pick one at 120 BPM with its drop at 0:04, and swap it for `mix.wav` in the encode step. `synth.py` also writes the effects alone to `sfx.wav` for laying over it.

## How it was designed

It was reverse-engineered from a 49-second Fiverr studio promo, then rebuilt around real work.

**What the reference does:** dark base with a purple glow, geometric sans type, orange and purple accents, glassy cards, whip pans with heavy motion blur, typewriter text, spring pop-ins, 3D card walls, kinetic type, cursor-driven UI demos, and a voiceover line per section over a ~118 BPM track.

| Reference | | This intro | |
| --- | --- | --- | --- |
| 0:00 | "Hello!" in small type on black | 0:00 | **Hook:** "You've got 1.70 s to stop the scroll", counting down live |
| 0:01 | "Ideas that become strategy." over stock photos | 0:02 | A phone feed scrolls past (SKIP, SKIP, SKIP) and stops on VANTA |
| 0:04 | Stock team wall | 0:04 | "Hey, I'm Ahmar" polaroid, then "I make ADS people actually watch." one word per beat |
| 0:07 | Floating portfolio cards, "Our Work" | 0:08 | 3D wall of 15 real films, then a fly-in to a 10-cut showreel synced to the beat |
| 0:11 | "Main focus": Vision / Design / Motion pills | 0:14 | Service wheel: 8 services, each with a live preview (LOG-to-graded split, waveform) |
| 0:14 | "woww!", AI agent UI | | |
| 0:20 | Kinetic type, colour flips | 0:18 | HOOKS / STORIES / ENDINGS, letters filled with footage |
| 0:23 | Client app demos, stock man at laptop | 0:22 | Browser playing the vid.ai, 1lookup and Sasify demos; cursor clicks "Start free trial" |
| 0:35 | "Press & play", categories wheel | 0:28 | Four phones playing reels |
| 0:40 | Memoji orbit | 0:32 | Why me: 5 years, 1 day, 2 languages; tools band |
| 0:42 | "Be Creative" → logo, fade to black | 0:36 | "Got footage? Let's talk!": cursor clicks "Message me", chat bubble |
| | | 0:42 | AHMAR end card, held clean |

**What changed and why:**

- The first two seconds make a promise instead of saying hello.
- Every shot is real work instead of stock people and other studios' apps.
- One visual system, the site's yellow, ink, pink, blue, green and orange, instead of a new style per scene.
- Type is large enough to read on a phone with the sound off, which is how most people first see it. It's also 1080p instead of 720p.
- It ends on a clear next step instead of 7 seconds of logo.
- No email or links appear in the video, so it's safe to upload to Fiverr.

## Voiceover script (optional)

To add your own voice, record these over the finished cut:

| Time | Line |
| --- | --- |
| 0:00 | You've got one point seven seconds to stop the scroll. |
| 0:04 | Hey, I'm Ahmar. I make ads people actually watch. |
| 0:08 | Commercials, concept films, reels, motion graphics and SaaS demos. |
| 0:18 | Hooks that stop the scroll. Stories people remember. Endings that make them act. |
| 0:22 | And launch videos that make software look simple. |
| 0:32 | Five years editing, back within a day, in Urdu or English. |
| 0:36 | Got footage? Let's talk. |
