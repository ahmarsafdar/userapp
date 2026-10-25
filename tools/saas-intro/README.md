# SaaS intro

The source of `media/films/saas-intro.mp4`: a 41.5-second, 1080p60 intro for SaaS clients. It uses only the three SaaS films (vid.ai, 1lookup and Sasify) plus product UI animated in code. There are no AI commercials or reels in it.

It's built with the same tools as the intro reel. See `tools/intro/README.md` for how the pieces fit together.

| File | What it is |
| --- | --- |
| `intro.html` | The animation: 8 scenes on one timeline |
| `clips.txt` | Which part of which SaaS film each shot uses |
| `synth.py` | The music and sound effects, using the instruments in `tools/intro/sound.py` |
| `lines.txt` | The voiceover script and cue times |
| `project.conf` | Output name, length and poster frame |

## Rebuild

```sh
tools/intro/build.sh tools/saas-intro
```

The setup is the same as for the intro reel. `VO=off` and `VO_FILE=recording.wav` work here too.

## What happens

| Time | Scene | Voiceover |
| --- | --- | --- |
| 0:00 | A grey screen recording with an "Are you still watching?" popup; viewers drop from 1,204 to 38. "Most SaaS demos look like this." Hold music tape-stops when the cursor clicks Exit | Your product is brilliant. Your demo? Not so much. |
| 0:04 | On the drop, the grey app turns into a polished dashboard: counters, bars, a line chart. A profile card pops in | Hey, I'm Ahmar. |
| 0:05 | "I make SaaS videos people actually watch." one word per beat, next to the profile card | I make SaaS videos people actually watch. |
| 0:08 | vid.ai: five shots cut on the beat in a browser, with its tagline. A cursor clicks Next | Product demos that make your features click. |
| 0:12 | 1lookup | Explainers that make the problem obvious. |
| 0:16 | Sasify | And motion explainers that make buying feel easy. |
| 0:20 | A ⌘K command palette types each service and selects it | Launch videos, product demos, walkthroughs and explainers. |
| 0:24 | Script, storyboard, animation, sound and mix check off; the progress bar ends on "Ready to launch" | You send the product. I do the rest. |
| 0:28 | SHOW IT / SIMPLIFY IT / SELL IT, letters filled with the SaaS footage | Show it. Simplify it. Sell it. |
| 0:32 | A signup form: the product link is typed, "Get my video" is clicked, and a message from Ahmar pops in | Launching something? Let's make the video that sells it. Just send me your product. |
| 0:38 | AHMAR end card, "SaaS video editor" | I'm Ahmar, SaaS video editor. |

The numbers in the demo dashboard are placeholder UI, not client results. No email or links appear in the video, so it's safe to upload to Fiverr.
