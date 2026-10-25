"""Voiceover for the intro reel, mixed over the soundtrack from synth.py.

python3 vo.py <work dir> [recorded.wav]

Reads music.wav and sfx.wav from the work dir and writes vo.wav and mix_vo.wav there.
Without a recording, the lines are spoken by the Kokoro voice model, which must be in
<work dir>/tts. The lines are LINES below, or <work dir>/lines.txt when it exists
("start | latest end | line" per row). A recording must be lined up with the video and
start at 0:00."""
import os
import sys
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
WORK = sys.argv[1]
RECORDING = sys.argv[2] if len(sys.argv) > 2 else None
VOICE = 'am_michael'
NAME = ('ˈɑːmɚ', 'ˈɑːmɑːɹ')  # say "Ahmar" as AH-mahr
SAY = {'SaaS': 'sass'}  # spellings the voice model reads better

# (start s, latest end s, line). Each line starts on its cue and is sped up if needed to end in time.
LINES = [
    (0.15, 3.2, "You've got one point seven seconds to stop the scroll."),
    (4.15, 5.4, "Hey, I'm Ahmar."),
    (5.5, 7.8, "I make ads people actually watch."),
    (8.1, 9.45, "Here's the good stuff."),
    (13.95, 17.85, "Commercials, concept films, reels, sass demos, even color and sound."),
    (18.0, 19.45, "Hooks that stop the scroll."),
    (19.55, 20.95, "Stories people remember."),
    (21.05, 22.5, "Endings that make them act."),
    (22.7, 26.45, "Building an app? I make launch videos that make people want to sign up."),
    (28.7, 31.8, "And vertical edits, made for the scroll."),
    (32.7, 36.4, "Five years editing. Back within a day. In Urdu or English."),
    (36.6, 38.1, "Got footage? Let's talk."),
    (38.25, 39.4, "Send me a message."),
    (40.1, 41.85, "Let's make yours next."),
    (42.4, 44.4, "I'm Ahmar, freelance video editor."),
]
LINES_FILE = os.path.join(WORK, 'lines.txt')
if os.path.exists(LINES_FILE):
    LINES = []
    for row in open(LINES_FILE, encoding='utf-8'):
        row = row.strip()
        if row and not row.startswith('#'):
            start, end, text = (x.strip() for x in row.split('|', 2))
            LINES.append((float(start), float(end), text))


def load(name):
    x, sr = sf.read(os.path.join(WORK, name), dtype='float32', always_2d=True)
    assert sr == SR
    return x


def sos(x, kind, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype=kind, fs=SR, output='sos'), x, axis=0)


def follow(x, attack, release):
    """Envelope follower on |x| (mono), attack/release in seconds."""
    a = np.exp(-1 / (attack * SR))
    r = np.exp(-1 / (release * SR))
    e = np.abs(x)
    # one-pole smoothing, separate attack and release, done in blocks for speed
    out = np.empty_like(e)
    y = 0.0
    blk = 64
    for i in range(0, len(e), blk):
        v = e[i:i + blk].max()
        c = a if v > y else r
        y = c ** blk * y + (1 - c ** blk) * v
        out[i:i + blk] = y
    return out


music, sfx = load('music.wav'), load('sfx.wav')
N = len(music)

if RECORDING:
    vo, sr = sf.read(RECORDING, dtype='float32', always_2d=True)
    if sr != SR:
        vo = signal.resample_poly(vo, SR, sr, axis=0)
    vo = vo.mean(1)
    vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
else:
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(WORK, 'tts/kokoro-v1.0.onnx'), os.path.join(WORK, 'tts/voices-v1.0.bin'))
    vo = np.zeros(N, np.float32)
    for start, end, text in LINES:
        spoken = text
        for word, say in SAY.items():
            spoken = spoken.replace(word, say)
        ph = k.tokenizer.phonemize(spoken, 'en-us').replace(*NAME)
        speed = 1.1
        while True:
            a, sr = k.create(ph, voice=VOICE, speed=speed, is_phonemes=True)
            if len(a) / sr <= end - start or speed >= 1.25:
                break
            speed += 0.05
        a = signal.resample_poly(a, SR, sr)
        i = int(start * SR)
        vo[i:i + len(a)] += a[:N - i]
        late = start + len(a) / SR - end
        print(f'{start:6.2f}-{start + len(a) / SR:6.2f} x{speed:.2f}  {text}' + (f'  (runs {late:.2f}s past its cue)' if late > 0.02 else ''))

# voice chain: clean lows, a little presence, gentle compression, a touch of room
vo = sos(vo, 'high', 90)
pres = sos(vo, 'band', [2500, 5000])
vo = vo + 0.35 * pres
env = follow(vo, 0.005, 0.1)
speech = env > env.max() * 0.01
thr = np.percentile(env[speech], 40)
vo = vo * np.where(env > thr, (thr / np.maximum(env, 1e-9)) ** (1 - 1 / 4), 1.0)
vo = vo / (np.abs(vo).max() + 1e-9)
vo = np.tanh(vo * 2.0) / np.tanh(2.0)  # soft limit the peaks
ir = np.random.default_rng(3).standard_normal(int(0.6 * SR)) * np.exp(-np.arange(int(0.6 * SR)) / (0.12 * SR))
ir[: int(0.01 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum())
vo = vo + signal.fftconvolve(vo, ir)[:N] * 0.06
sf.write(os.path.join(WORK, 'vo.wav'), (vo / (np.abs(vo).max() + 1e-9) * 0.89).astype(np.float32), SR)

# duck the music (and the effects a little) under the voice
duck = np.clip(follow(vo, 0.02, 0.35) / 0.12, 0, 1)
music_gain = 10 ** (-8 * duck / 20)
sfx_gain = 10 ** (-3 * duck / 20)
bed = music * music_gain[:, None] + sfx * sfx_gain[:, None]
# voice sits 7 dB above the ducked bed while it speaks
talk = duck > 0.5
rms = lambda x: np.sqrt(np.mean(x ** 2) + 1e-12)
vo = vo * (rms(bed[talk]) / rms(vo[talk])) * 10 ** (7 / 20)
mix = bed + vo[:, None]
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.0) / np.tanh(1.0) * 0.89
fl = int(0.4 * SR)
mix[-fl:] *= np.linspace(1, 0, fl)[:, None]
sf.write(os.path.join(WORK, 'mix_vo.wav'), mix.astype(np.float32), SR)
print('ok')
