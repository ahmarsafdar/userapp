"""Music for the HBL Prestige film, cut from "Chrome Requiem" (music/chrome-requiem.mp3).
The track runs at 127.99 BPM to the film's 128, so its own beat carries the cuts. Three pieces of it, joined on the beat:
  0:00    the synth melody, faded in. The bass enters at 0:02.35 as the key light comes on.
  0:04.3  eight beats further into the track: the riser stops dead on the cut to the liquid metal, a breath, the song's
          snare roll, and its drop on the impact at 0:06.1. From there every cut lands on the beat.
  0:16.9  the song's outro, on the same beat: chords under the floating card, a roll, and the song's last boom on the
          logo at 0:20.63, ringing out.
Writes mix.wav (48 kHz stereo float) to the folder given as the first argument, or next to this script."""
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

SR = 48000
DUR = 23.5
HERE = os.path.dirname(os.path.abspath(__file__))
TRACK = os.path.join(HERE, 'music', 'chrome-requiem.mp3')
OUT = sys.argv[1] if len(sys.argv) > 1 else HERE

# (film time, track time at that moment, crossfade). Each piece is at full level from its film time; the one before it
# fades out over the crossfade just ahead of it, so the beat that opens a piece is never smeared.
# The drop is at 15.205 s in the track and the song's last boom at 157.703 s.
PIECES = [
    (0.0, 5.354, 0.0),
    (4.3, 13.405, 0.02),
    (16.875, 153.945, 0.06),
]
FADE_IN, FADE_OUT = 0.6, 0.5

pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', TRACK, '-map', '0:a', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'],
                     check=True, capture_output=True).stdout
track = np.frombuffer(pcm, np.float32).reshape(-1, 2)

N = int(round(SR * DUR))
t = np.arange(N) / SR
mix = np.zeros((N, 2), np.float32)
for i, (start, at, fade) in enumerate(PIECES):
    up = np.clip(t / FADE_IN, 0, 1) if i == 0 else np.clip((t - start + fade) / fade, 0, 1)
    if i + 1 < len(PIECES):
        end, end_fade = PIECES[i + 1][0], PIECES[i + 1][2]
    else:
        end, end_fade = DUR, FADE_OUT
    down = np.clip((end - t) / end_fade, 0, 1)
    gain = np.sin(np.pi / 2 * np.minimum(up, down))  # equal power across each crossfade
    on = np.flatnonzero(gain > 0)
    src = np.round((at - start) * SR).astype(int) + on
    mix[on] += track[src] * gain[on, None]

sf.write(os.path.join(OUT, 'mix.wav'), mix, SR, subtype='FLOAT')  # float: the decoded MP3 peaks just over full scale
print(f'ok {DUR} peak {np.abs(mix).max():.2f}')
