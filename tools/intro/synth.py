"""Original soundtrack + sound design for the Ahmar intro (120 BPM, A minor / C major).
Writes music.wav, sfx.wav and mix.wav (48 kHz stereo float) to the folder given as the
first argument, or next to this script."""
import os
import sys
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sound import *  # noqa: E402,F403  (SR, BEAT, rng, buf, place and the instruments)

DUR = 46.0
N = int(SR * DUR)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

# ---------------- music ----------------
music = buf(N)
CHORDS = [  # bars from t=4.0, 2 s each: Am F C G
    (['A3', 'C4', 'E4', 'A4'], 'A1'),
    (['F3', 'A3', 'C4', 'F4'], 'F1'),
    (['G3', 'C4', 'E4', 'G4'], 'C2'),
    (['G3', 'B3', 'D4', 'G4'], 'G1'),
]


def chord_at(t):
    return CHORDS[int(np.floor((t - 4.0) / 2.0)) % 4]


def on(segs, t):
    return any(a <= t < b for a, b in segs)


KICK = [(2.0, 3.3), (4.0, 13.5), (14.0, 17.9), (18.0, 36.5), (40.5, 41.95), (42.0, 44.0)]
KICK_MUFFLED = [(2.0, 3.3)]
CLAP = [(4.0, 13.5), (14.0, 17.9), (18.0, 22.5), (28.5, 36.5), (42.0, 44.0)]
HATS = [(2.0, 3.3), (4.0, 13.5), (14.0, 17.9), (18.0, 36.5), (36.5, 40.0), (40.0, 41.95), (42.0, 44.0)]
OPENHAT = [(9.5, 13.0), (18.0, 22.5), (28.5, 36.5), (42.0, 44.0)]
BASS = [(4.0, 13.5), (14.0, 17.9), (18.0, 36.5), (42.0, 44.0)]
SUBHOLD = [(36.5, 41.95)]
PAD = [(0.0, 3.3), (4.0, 44.0)]
ARP = [(22.5, 28.5), (40.0, 41.95)]

# drums on a 16th grid
for i in range(int(DUR / 0.125)):
    t = i * 0.125
    pos = (i % 4)
    beat_i = int(round(t / BEAT))
    if pos == 0:
        if on(KICK, t):
            k = kick()
            if on(KICK_MUFFLED, t):
                k = sos_filter(k, 'low', 350) * 0.55
            place(music, k, t, 0.95)
        if on(CLAP, t) and beat_i % 2 == 1:
            place(music, clap(), t, 0.8, 0.0)
    if on(HATS, t):
        g = 0.55 if pos == 2 else 0.22
        if on(KICK_MUFFLED, t):
            g *= 0.4
        if 36.5 <= t < 40.0 and pos != 2:
            continue
        place(music, hat(gain=g), t, 1.0, 0.25 if pos % 2 else -0.2)
    if pos == 2 and on(OPENHAT, t):
        place(music, hat(True, 0.6), t, 1.0, 0.3)

# sidechain envelope from kick hits
sc = np.ones(N, np.float32)
for i in range(int(DUR / BEAT)):
    t = i * BEAT
    if on(KICK, t) and not on(KICK_MUFFLED, t):
        a = int(t * SR)
        d = np.arange(min(int(0.5 * SR), N - a)) / SR
        sc[a:a + len(d)] = np.minimum(sc[a:a + len(d)], 1 - 0.75 * np.exp(-d / 0.11))

# pad / supersaw chords (rendered per bar)
pad = buf(N)
for bar in range(-2, 20):
    t0 = 4.0 + bar * 2.0
    if t0 + 2 <= 0 or t0 >= 44.0:
        continue
    notes, root = chord_at(t0)
    d = 2.08
    seg = np.zeros((int(d * SR), 2))
    for nt in notes:
        for k, det in enumerate([-0.11, -0.05, 0, 0.05, 0.11]):
            f = hz(nt) * 2 ** (det / 12)
            w = polyblep_saw(f, d, rng.uniform())
            seg[:, k % 2] += w * 0.12
            seg[:, (k + 1) % 2] += w * 0.05
    seg = sos_filter(sos_filter(seg, 'low', 2800), 'high', 160)
    e = np.minimum(1, tt(d) / 0.02) * np.minimum(1, (d - tt(d)) / 0.06)
    seg *= e[:, None]
    place(pad, seg.astype(np.float32), max(t0, 0) if t0 >= 0 else 0, 1.0)
# intro / feed section: dark filtered drone
pad_t = np.arange(N) / SR
pad_gain = np.zeros(N)
for a, b in PAD:
    m = (pad_t >= a) & (pad_t < b)
    pad_gain[m] = 1
pad_lp = sos_filter(pad, 'low', 600)
intro_mix = np.clip((pad_t - 0.0) / 1.5, 0, 1) * (pad_t < 4.0)
main_mix = (pad_t >= 4.0) * 1.0
breakdown = (pad_t >= 36.5) & (pad_t < 42.0)
pad_out = pad_lp * (intro_mix * 0.9)[:, None] + pad * (main_mix * np.where(breakdown, 1.15, 0.75))[:, None]
pad_out *= pad_gain[:, None]
pad_out *= np.where(breakdown, 1.0, sc)[:, None]
pad_out[(pad_t >= 3.3) & (pad_t < 4.0)] *= 0.0
music += pad_out.astype(np.float32) * 0.8

# bass: offbeat 8ths + sub
for i in range(int(DUR / 0.25)):
    t = i * 0.25
    if i % 2 == 1 and on(BASS, t):
        _, root = chord_at(t)
        f = hz(root) * 2
        d = 0.22
        w = polyblep_saw(f, d) * 0.6 + np.sin(2 * np.pi * f / 2 * tt(d)) * 0.5
        w = sos_filter(w, 'low', 520) * np.minimum(1, (d - tt(d)) / 0.03) * np.minimum(1, tt(d) / 0.004)
        place(music, np.tanh(w * 1.3) * 0.5, t)
for a, b in SUBHOLD:
    t = a
    while t < b:
        _, root = chord_at(t)
        d = min(2.0 - ((t - 4.0) % 2.0), b - t)
        w = np.sin(2 * np.pi * hz(root) * tt(d)) * 0.28
        w *= np.minimum(1, tt(d) / 0.05) * np.minimum(1, (d - tt(d)) / 0.05)
        place(music, w, t)
        t += d
# heartbeat sub in the hook
for t in [0.0, 0.5, 1.0, 1.5]:
    place(music, sos_filter(kick(0.7), 'low', 200), t, 0.8)

# arp plucks (16ths)
for i in range(int(DUR / 0.125)):
    t = i * 0.125
    if on(ARP, t):
        notes, _ = chord_at(t)
        seq = [notes[0], notes[2], notes[1], notes[3], notes[2], notes[1], notes[3], notes[2]]
        f = hz(seq[i % 8]) * 2
        d = 0.18
        w = polyblep_saw(f, d) * np.exp(-tt(d) / 0.07)
        w = sos_filter(w, 'low', 2400)
        g = 0.18 * (0.6 if 40.0 <= t else 1.0)
        place(music, w * g, t, 1.0, 0.35 if i % 2 else -0.35)

# builds
for i in range(16):  # 9.1-9.5 snare roll
    place(music, snare(0.25 + i * 0.04), 9.0 + i * 0.03125)
for i in range(8):  # 13.0-13.5 fill 16ths
    place(music, snare(0.35 + i * 0.06), 13.0 + i * 0.0625)
t = 40.0  # final build: accelerating snare
step = 0.25
while t < 41.95:
    place(music, snare(0.2 + 0.5 * (t - 40.0) / 2.0), t)
    if t >= 41.0:
        step = 0.0625
    elif t >= 40.5:
        step = 0.125
    t += step

# master fx on music: gentle saturation
music = np.tanh(music * 1.1) * 0.85

# ---------------- sfx ----------------
sfx = buf(N)
P = lambda x, t, g=1.0, pan=0.0: place(sfx, np.asarray(x, np.float32), t, g, pan)
# hook
for k in range(18):
    P(tick(2600 if k % 2 == 0 else 2100, 0.9), 0.3 + k * 0.1, 0.8, 0.15 if k % 2 else -0.15)
P(boom(1.2, 50, 0.8), 0.0, 0.45)
P(pop(1200, 500, 0.1), 0.75, 0.5)
P(riser(1.3, 0.9), 0.7, 0.55)
P(whoosh(0.45, 300, 6000, 1.0), 1.75, 0.7)
# feed
for t in [2.15, 2.5, 2.85]:
    P(whoosh(0.28, 900, 5000, 0.9), t - 0.03, 0.55, 0.1)
for t, pan in [(2.3, -0.5), (2.65, 0.5), (2.98, -0.5)]:
    P(blip_err(1.0), t, 0.7, pan)
P(slam(1.2), 3.3, 0.95)
P(boom(1.0, 48, 0.9), 3.3, 0.5)
P(pop(1500, 700, 0.12, 1.0), 3.35, 0.5, 0.2)
P(sparkle(0.5, 0.8), 3.36, 0.45, 0.2)
P(rev_cymbal(0.55, 1.2), 3.43, 0.7)
P(riser(0.5, 0.6), 3.45, 0.5)
P(whoosh(0.4, 200, 3500, 1.0), 3.72, 0.65)
# meet
P(crash(1.0), 4.0, 0.9)
P(boom(1.6, 45, 1.0), 4.0, 0.8)
P(whoosh(0.3, 2000, 400, 0.8, up=False), 3.98, 0.45, 0.3)
P(slam(0.8), 4.2, 0.5, 0.3)
P(pop(900, 300, 0.1), 4.5, 0.6, 0.3)
P(pop(1100, 400, 0.1), 4.75, 0.5, 0.4)
P(whoosh(0.25, 800, 3000, 0.6), 5.25, 0.4, -0.3)
for t in [5.5, 6.0, 6.5, 7.0, 7.5]:
    P(slam(1.0), t, 0.75, -0.25)
P(pop(1300, 500, 0.1), 6.02, 0.5, -0.2)
P(whoosh(0.2, 1500, 7000, 0.5), 7.58, 0.35, -0.2)
P(whip(0.3, 1.0), 7.8, 0.75)
# grid
P(whoosh(0.5, 200, 2500, 0.7), 7.95, 0.45, 0.2)
P(whoosh(0.5, 300, 3500, 0.6), 8.12, 0.35, -0.2)
P(pop(800, 260, 0.12, 1.2), 8.2, 0.7)
P(pop(300, 900, 0.1, 0.8), 8.95, 0.4)
P(riser(0.45, 0.8), 9.05, 0.6)
P(whoosh(0.35, 200, 6000, 1.0), 9.2, 0.6)
# montage
P(boom(1.4, 45, 1.0), 9.5, 0.75)
P(crash(1.0), 9.5, 0.8)
for t in [10.0, 11.0, 12.0, 13.25]:
    P(slam(0.6), t, 0.4)
    P(sos_filter(noise(0.08), 'high', 3000) * env_exp(0.08, 0.015), t, 0.25)
for t in [10.5, 11.5, 12.5, 12.75, 13.0]:
    P(whip(0.16, 0.5), t - 0.04, 0.3, 0.3)
P(rev_cymbal(0.45, 1.0), 13.55, 0.6)
P(whoosh(0.45, 4000, 300, 0.7, up=False), 13.62, 0.5)
# categories
P(crash(0.6), 14.0, 0.5)
P(pop(800, 300, 0.1), 13.95, 0.6, 0.1)
scale = ['A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6']
for j in range(1, 8):
    t = 14.0 + 0.5 * j - 0.06
    P(click(0.9), t, 0.6, -0.3)
    f = hz(scale[j - 1])
    d = 0.4
    w = (polyblep_saw(f, d) * 0.3 + np.sin(2 * np.pi * f * tt(d))) * np.exp(-tt(d) / 0.12)
    P(sos_filter(w, 'low', 3500) * 0.35, t + 0.02, 0.8, 0.2)
P(whoosh(0.35, 300, 5000, 0.8), 17.75, 0.55)
# kinetic
for t in [18.0, 19.5, 21.0]:
    P(boom(1.2, 50, 1.0), t, 0.55)
    P(slam(1.2), t, 0.6)
    P(crash(0.8), t, 0.55)
    P(rev_cymbal(0.35, 0.8), t - 0.35, 0.45)
P(whoosh(0.35, 400, 5000, 0.8), 22.3, 0.55, 0.4)
# saas
P(whoosh(0.5, 250, 3000, 0.8), 22.55, 0.45, 0.4)
for k, t in enumerate([23.3, 23.7, 24.1, 24.5]):
    P(pop(700 + k * 150, 300 + k * 60, 0.1), t, 0.55, [-0.4, 0.5, 0.5, 0.1][k])
for t in [25.0, 26.75]:
    P(whip(0.26, 0.8), t - 0.03, 0.45, 0.4)
P(pop(900, 350, 0.1), 25.6, 0.55, -0.4)
P(click(1.2), 26.5, 0.9, -0.4)
P(ding(1.0), 26.62, 0.5, -0.4)
P(sparkle(0.5, 1.0), 26.6, 0.45, -0.4)
P(whoosh(0.35, 400, 5000, 0.8), 28.3, 0.55, 0.4)
# scroll
for i in range(4):
    P(whoosh(0.3, 300, 3000, 0.6), 28.58 + i * 0.12, 0.3, -0.6 + i * 0.4)
    P(pop(900 + i * 120, 320, 0.09), 28.62 + i * 0.12, 0.35, 0.0)
for i in range(4):
    P(pop(1300 + i * 100, 600, 0.08), 29.3 + i * 0.12, 0.35, -0.6 + i * 0.4)
for i in range(14):
    P(pop(1600 + (i % 4) * 140, 900, 0.06), 29.5 + i * 0.19, 0.18, rng.uniform(-0.6, 0.6))
P(whoosh(0.3, 3000, 300, 0.6, up=False), 32.28, 0.4)
# why
P(whoosh(0.35, 400, 5000, 0.8), 32.33, 0.55)
for k, t in enumerate([32.7, 33.2, 33.7]):
    P(slam(1.0), t, 0.7, [-0.4, 0, 0.4][k])
    n = [5, 1, 2][k]
    for m in range(n):
        P(tick(1800 + m * 200, 0.8), t + 0.08 + m * (0.3 / max(n, 1)), 0.5, [-0.4, 0, 0.4][k])
P(whoosh(0.4, 300, 2500, 0.7), 34.15, 0.45)
P(whoosh(0.35, 400, 5000, 0.8), 36.33, 0.55)
# cta
P(boom(2.0, 42, 1.0), 36.5, 0.8)
P(crash(0.9), 36.5, 0.6)
P(slam(1.2), 36.6, 0.75)
P(slam(1.2), 37.1, 0.75)
P(whoosh(0.3, 600, 3000, 0.5), 37.55, 0.3)
P(pop(800, 300, 0.1), 38.0, 0.55, -0.3)
P(pop(950, 340, 0.1), 38.15, 0.55, 0.3)
P(tick(3000, 0.6), 39.05, 0.4, 0.3)
P(click(1.2), 39.4, 0.9, 0.3)
P(sparkle(0.5, 1.0), 39.45, 0.45, 0.3)
P(ding(1.0), 39.6, 0.6, 0.3)
P(riser(2.0, 1.0), 40.0, 0.6)
P(rev_cymbal(0.6, 1.2), 41.4, 0.6)
# end
P(boom(2.4, 42, 1.1), 42.0, 0.85)
P(crash(1.1), 42.0, 0.9)
P(whoosh(0.5, 200, 4000, 0.9), 41.85, 0.6)
for i in range(5):
    P(slam(0.5), 42.12 + i * 0.06, 0.35, -0.4 + i * 0.2)
P(sparkle(0.7, 1.0), 42.48, 0.5, 0.3)
P(bell(hz('A5'), 1.5, 0.8), 42.48, 0.5, 0.3)
P(pop(900, 320, 0.1), 42.75, 0.55)
for i in range(8):
    P(pop(1400 + i * 90, 700, 0.06), 42.8 + i * 0.06, 0.2, rng.uniform(-0.7, 0.7))
# final stab at 44.0
stab = np.zeros((int(2.0 * SR), 2))
for nt in ['A2', 'A3', 'C4', 'E4', 'A4']:
    for det in [-0.08, 0, 0.08]:
        w = polyblep_saw(hz(nt) * 2 ** (det / 12), 2.0, rng.uniform())
        stab[:, 0] += w * 0.1
        stab[:, 1] += w * 0.1
stab = sos_filter(stab, 'low', 3000) * env_exp(2.0, 0.55)[:, None]
place(music, stab.astype(np.float32), 44.0, 0.7)
place(music, kick(1.0), 44.0, 1.0)
P(crash(1.0), 44.0, 0.7)
P(boom(2.0, 44, 0.8), 44.0, 0.45)

# ---------------- reverb ----------------
def reverb_ir(d=1.8, rt=1.5):
    t = tt(d)
    ir = rng.standard_normal((len(t), 2)) * np.exp(-6.9 * t / rt)[:, None]
    ir = sos_filter(ir, 'low', 6000)
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum())


IR = reverb_ir()
def wet(x, amt):
    y = np.stack([signal.fftconvolve(x[:, c], IR[:, c])[:N] for c in range(2)], 1)
    return x + y * amt


music = wet(music, 0.18)
sfx = wet(sfx, 0.22)

# ---------------- mixdown ----------------
music = sos_filter(music, 'high', 32)
music *= 0.55
sfx = sos_filter(sfx, 'high', 38)
sfx *= 0.75
mix = music + sfx
# soft limiter
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.0) / np.tanh(1.0) * 0.89
fade = np.ones(N)
fl = int(0.4 * SR)
fade[-fl:] = np.linspace(1, 0, fl)
mix *= fade[:, None]
# stems keep their balance in the mix, so vo.py can remix them under the voice
sf.write(os.path.join(OUT, 'music.wav'), (music / peak * 0.89).astype(np.float32), SR)
sf.write(os.path.join(OUT, 'sfx.wav'), (sfx / peak * 0.89).astype(np.float32), SR)
sf.write(os.path.join(OUT, 'mix.wav'), mix.astype(np.float32), SR)
print('ok', N / SR, 'peak', float(np.abs(mix).max()))
