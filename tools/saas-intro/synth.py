"""Original soundtrack + sound design for the SaaS intro (120 BPM, C major).
A dull hold-music loop under the "boring demo", a tape stop, then the real track drops at 0:04.
Writes music.wav, sfx.wav and mix.wav (48 kHz stereo float) to the folder given as the
first argument, or next to this script."""
import os
import sys
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'intro'))
from sound import *  # noqa: E402,F403  (SR, BEAT, rng, buf, place and the instruments)

DUR = 41.5
N = int(SR * DUR)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

# ---------------- music ----------------
music = buf(N)
CHORDS = [  # bars from t=4.0, 2 s each: C G Am F
    (['C4', 'E4', 'G4', 'C5'], 'C2'),
    (['B3', 'D4', 'G4', 'B4'], 'G1'),
    (['A3', 'C4', 'E4', 'A4'], 'A1'),
    (['A3', 'C4', 'F4', 'A4'], 'F1'),
]


def chord_at(t):
    return CHORDS[int(np.floor((t - 4.0) / 2.0)) % 4]


def on(segs, t):
    return any(a <= t < b for a, b in segs)


KICK = [(4.0, 19.5), (20.0, 32.0), (38.0, 40.0)]
CLAP = [(4.0, 19.5), (24.0, 32.0), (38.0, 40.0)]
HATS = [(4.0, 19.5), (20.0, 37.95), (38.0, 40.0)]
OPENHAT = [(8.0, 19.5), (28.0, 32.0), (38.0, 40.0)]
BASS = [(4.0, 19.5), (20.0, 32.0), (38.0, 40.0)]
SUBHOLD = [(32.0, 37.95)]
PAD = [(4.0, 40.0)]
ARP = [(20.0, 28.0), (36.0, 37.95)]
BREAKDOWN = (32.0, 38.0)

# hold music: thin bells and a plodding bass, then a tape stop when the viewer clicks Exit
muzak = np.zeros(int(3.6 * SR))
for i in range(int(3.6 / 0.25)):
    t = i * 0.25
    f = hz(['C5', 'E5', 'G5', 'E5', 'A4', 'C5', 'F5', 'C5'][i % 8])
    b = bell(f, 0.4, 0.5)
    o = int(t * SR)
    muzak[o:o + len(b)] += b[:len(muzak) - o]
for i in range(int(3.6 / 0.5)):
    t = i * 0.5
    f = hz(['C3', 'G2', 'A2', 'F2'][(i // 2) % 4])
    d = 0.45
    w = np.sin(2 * np.pi * f * tt(d)) * np.exp(-tt(d) / 0.25) * 0.5
    o = int(t * SR)
    muzak[o:o + len(w)] += w[:len(muzak) - o]
muzak = sos_filter(sos_filter(muzak, 'low', 2500), 'high', 120) * 0.6
STOP, STOP_LEN = 3.05, 0.4
tape = np.zeros(int((STOP + STOP_LEN) * SR))
tape[:int(STOP * SR)] = muzak[:int(STOP * SR)]
tau = tt(STOP_LEN)
pos = STOP + tau - tau ** 2 / (2 * STOP_LEN)  # playback slows from 1x to 0
tape[int(STOP * SR):int(STOP * SR) + len(tau)] = np.interp(pos * SR, np.arange(len(muzak)), muzak) * (1 - tau / STOP_LEN) ** 0.5
place(music, np.tanh(tape * 1.2) * 0.5, 0.0)

# drums on a 16th grid
for i in range(int(DUR / 0.125)):
    t = i * 0.125
    pos = i % 4
    beat_i = int(round(t / BEAT))
    if pos == 0:
        if on(KICK, t):
            place(music, kick(), t, 0.95)
        if on(CLAP, t) and beat_i % 2 == 1:
            place(music, clap(), t, 0.8, 0.0)
    if on(HATS, t):
        if BREAKDOWN[0] <= t < 36.0 and pos != 2:
            continue
        place(music, hat(gain=0.55 if pos == 2 else 0.22), t, 1.0, 0.25 if pos % 2 else -0.2)
    if pos == 2 and on(OPENHAT, t):
        place(music, hat(True, 0.6), t, 1.0, 0.3)

# sidechain envelope from kick hits
sc = np.ones(N, np.float32)
for i in range(int(DUR / BEAT)):
    t = i * BEAT
    if on(KICK, t):
        a = int(t * SR)
        d = np.arange(min(int(0.5 * SR), N - a)) / SR
        sc[a:a + len(d)] = np.minimum(sc[a:a + len(d)], 1 - 0.75 * np.exp(-d / 0.11))

# supersaw chords, one bar at a time
pad = buf(N)
for bar in range(0, 18):
    t0 = 4.0 + bar * 2.0
    if t0 >= 40.0:
        break
    notes, root = chord_at(t0)
    d = 2.08
    seg = np.zeros((int(d * SR), 2))
    for nt in notes:
        for k, det in enumerate([-0.11, -0.05, 0, 0.05, 0.11]):
            w = polyblep_saw(hz(nt) * 2 ** (det / 12), d, rng.uniform())
            seg[:, k % 2] += w * 0.12
            seg[:, (k + 1) % 2] += w * 0.05
    seg = sos_filter(sos_filter(seg, 'low', 2800), 'high', 160)
    seg *= (np.minimum(1, tt(d) / 0.02) * np.minimum(1, (d - tt(d)) / 0.06))[:, None]
    place(pad, seg.astype(np.float32), t0)
pad_t = np.arange(N) / SR
pad_gain = np.zeros(N)
for a, b in PAD:
    pad_gain[(pad_t >= a) & (pad_t < b)] = 1
breakdown = (pad_t >= BREAKDOWN[0]) & (pad_t < BREAKDOWN[1])
pad *= (pad_gain * np.where(breakdown, 1.15, 0.75))[:, None]
pad *= np.where(breakdown, 1.0, sc)[:, None]
music += pad.astype(np.float32) * 0.8

# bass: offbeat 8ths, and a held sub in the breakdown
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

# arp plucks (16ths)
for i in range(int(DUR / 0.125)):
    t = i * 0.125
    if on(ARP, t):
        notes, _ = chord_at(t)
        seq = [notes[0], notes[2], notes[1], notes[3], notes[2], notes[1], notes[3], notes[2]]
        d = 0.18
        w = polyblep_saw(hz(seq[i % 8]) * 2, d) * np.exp(-tt(d) / 0.07)
        w = sos_filter(w, 'low', 2400)
        place(music, w * (0.11 if t >= 36.0 else 0.18), t, 1.0, 0.35 if i % 2 else -0.35)

# fills and the final build
for i in range(8):
    place(music, snare(0.35 + i * 0.06), 19.5 + i * 0.0625)
t, step = 36.0, 0.25
while t < 37.95:
    place(music, snare(0.2 + 0.5 * (t - 36.0) / 2.0), t)
    step = 0.0625 if t >= 37.0 else 0.125 if t >= 36.5 else 0.25
    t += step

# final stab at 40.0
stab = np.zeros((int(1.5 * SR), 2))
for nt in ['C3', 'C4', 'E4', 'G4', 'C5']:
    for det in [-0.08, 0, 0.08]:
        w = polyblep_saw(hz(nt) * 2 ** (det / 12), 1.5, rng.uniform())
        stab[:, 0] += w * 0.1
        stab[:, 1] += w * 0.1
stab = sos_filter(stab, 'low', 3000) * env_exp(1.5, 0.45)[:, None]
place(music, stab.astype(np.float32), 40.0, 0.7)
place(music, kick(1.0), 40.0, 1.0)

music = np.tanh(music * 1.1) * 0.85

# ---------------- sfx ----------------
sfx = buf(N)
P = lambda x, t, g=1.0, pan=0.0: place(sfx, np.asarray(x, np.float32), t, g, pan)  # noqa: E731
# boring demo
P(pop(900, 300, 0.1), 0.35, 0.55, -0.4)
P(pop(1050, 350, 0.1), 0.75, 0.55, -0.3)
P(pop(1300, 600, 0.08), 0.5, 0.35, 0.5)
for k, t in enumerate([1.2, 1.7, 2.3]):
    P(pop(500 - k * 60, 180, 0.12), t, 0.3, 0.5)
P(bell(hz('E5'), 0.8, 0.6), 2.0, 0.3)
P(bell(hz('C5'), 0.8, 0.6), 2.12, 0.3)
P(click(1.0), 3.0, 0.8, 0.1)
P(whoosh(0.5, 3000, 300, 0.8, up=False), 3.35, 0.5)
P(rev_cymbal(0.55, 1.2), 3.45, 0.7)
P(riser(0.55, 0.7), 3.45, 0.55)
P(whoosh(0.4, 200, 3500, 1.0), 3.65, 0.6)
# glow-up
P(crash(1.0), 4.0, 0.9)
P(boom(1.6, 45, 1.0), 4.0, 0.8)
for i in range(3):
    P(pop(800 + i * 150, 320 + i * 60, 0.1), 4.05 + i * 0.1, 0.55, -0.4 + i * 0.4)
for i in range(12):
    P(tick(900 + i * 110, 0.9), 4.32 + i * 0.04, 0.45, -0.5 + i * 0.08)
P(whoosh(0.6, 2000, 8000, 0.4), 4.45, 0.3, 0.4)
P(pop(700, 250, 0.12, 1.2), 4.6, 0.7, 0.4)
P(whoosh(0.3, 800, 4000, 0.7), 5.25, 0.45)
for t in [5.5, 6.0, 6.5, 7.0, 7.5]:
    P(slam(1.0), t, 0.75, -0.25)
P(pop(1300, 500, 0.1), 6.02, 0.5, -0.2)
P(whoosh(0.2, 1500, 7000, 0.5), 7.58, 0.35, -0.2)
P(whip(0.3, 1.0), 7.8, 0.75)
# work
P(whoosh(0.5, 250, 3000, 0.8), 7.95, 0.45, 0.4)
for p0 in [8.0, 12.0, 16.0]:
    P(pop(900, 320, 0.1), p0 + 0.15, 0.5, -0.4)
    for j in range(1, 5):
        P(whip(0.16, 0.5), p0 + j * 0.75 - 0.04, 0.25, 0.4)
for t in [11.75, 15.75]:
    P(click(1.1), t, 0.8, -0.3)
for t in [12.0, 16.0]:
    P(whip(0.3, 0.9), t - 0.04, 0.55, 0.3)
    P(crash(0.5), t, 0.35)
P(whoosh(0.35, 400, 5000, 0.8), 19.75, 0.55)
# command palette
P(whoosh(0.5, 300, 3000, 0.7), 20.0, 0.45)
PQ = [20.5, 21.0, 21.5, 22.0, 22.5, 23.0]
QUERIES = ['launch video', 'product demo', 'ui walkthrough', 'explainer', 'feature release', 'social cutdowns']
NOTES = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6']
for q0, q, nt in zip(PQ, QUERIES, NOTES):
    for j in range(len(q)):
        P(click(0.5), q0 + j * 0.26 / len(q), 0.35, rng.uniform(-0.3, 0.3))
    f = hz(nt)
    d = 0.4
    w = (polyblep_saw(f, d) * 0.3 + np.sin(2 * np.pi * f * tt(d))) * np.exp(-tt(d) / 0.12)
    P(sos_filter(w, 'low', 3500) * 0.35, q0 + 0.27, 0.8, 0.2)
P(whoosh(0.35, 400, 5000, 0.8), 23.75, 0.55)
# pipeline
P(whoosh(0.25, 800, 3000, 0.6), 24.08, 0.35)
P(whoosh(0.25, 800, 3000, 0.6), 24.43, 0.35)
for i in range(4):
    P(pop(800 + i * 120, 300, 0.1), 24.6 + i * 0.15, 0.5, -0.6 + i * 0.4)
for i, nt in enumerate(['C5', 'E5', 'G5', 'C6']):
    P(bell(hz(nt), 0.8, 0.8), 25.5 + i * 0.5, 0.5, -0.6 + i * 0.4)
    P(pop(1400, 700, 0.06), 25.5 + i * 0.5, 0.3, -0.6 + i * 0.4)
P(riser(1.9, 0.5), 25.3, 0.35)
P(ding(1.0), 27.25, 0.55)
P(sparkle(0.5, 1.0), 27.25, 0.45)
P(whoosh(0.35, 400, 5000, 0.8), 27.75, 0.55)
# kinetic
for t in [28.0, 29.5, 31.0]:
    P(boom(1.2, 50, 1.0), t, 0.55)
    P(slam(1.2), t, 0.6)
    P(crash(0.8), t, 0.5)
    P(rev_cymbal(0.35, 0.8), t - 0.35, 0.4)
P(whoosh(0.35, 400, 5000, 0.8), 31.8, 0.55, 0.4)
# cta
P(boom(2.0, 42, 1.0), 32.0, 0.7)
P(whoosh(0.25, 800, 3000, 0.6), 32.13, 0.35)
P(whoosh(0.25, 800, 3000, 0.6), 32.33, 0.35)
for j in range(15):
    P(click(0.5), 33.4 + j * 0.8 / 15, 0.35, rng.uniform(-0.3, 0.3))
P(pop(800, 300, 0.1), 33.5, 0.55, 0.3)
P(tick(3000, 0.6), 34.92, 0.4, 0.3)
P(click(1.2), 35.1, 0.9, 0.3)
P(sparkle(0.5, 1.0), 35.15, 0.45, 0.3)
P(pop(1200, 500, 0.1), 35.22, 0.45, 0.3)
P(whoosh(0.4, 600, 3000, 0.5), 35.65, 0.3, 0.6)
P(ding(1.0), 35.75, 0.6, 0.5)
P(riser(2.0, 1.0), 36.0, 0.6)
P(rev_cymbal(0.6, 1.2), 37.4, 0.6)
P(whoosh(0.5, 200, 4000, 0.9), 37.85, 0.6)
# end
P(boom(2.4, 42, 1.1), 38.0, 0.85)
P(crash(1.1), 38.0, 0.9)
for i in range(5):
    P(slam(0.5), 38.12 + i * 0.06, 0.35, -0.4 + i * 0.2)
P(sparkle(0.7, 1.0), 38.48, 0.5, 0.3)
P(bell(hz('C6'), 1.5, 0.8), 38.48, 0.5, 0.3)
P(pop(900, 320, 0.1), 38.75, 0.55)
for i in range(8):
    P(pop(1400 + i * 90, 700, 0.06), 38.8 + i * 0.06, 0.2, rng.uniform(-0.7, 0.7))
P(crash(1.0), 40.0, 0.7)
P(boom(2.0, 44, 0.8), 40.0, 0.45)


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
music = sos_filter(music, 'high', 32) * 0.55
sfx = sos_filter(sfx, 'high', 38) * 0.75
mix = music + sfx
peak = np.abs(mix).max()
mix = np.tanh(mix / peak) / np.tanh(1.0) * 0.89
fl = int(0.4 * SR)
mix[-fl:] *= np.linspace(1, 0, fl)[:, None]
# stems keep their balance in the mix, so vo.py can remix them under the voice
sf.write(os.path.join(OUT, 'music.wav'), (music / peak * 0.89).astype(np.float32), SR)
sf.write(os.path.join(OUT, 'sfx.wav'), (sfx / peak * 0.89).astype(np.float32), SR)
sf.write(os.path.join(OUT, 'mix.wav'), mix.astype(np.float32), SR)
print('ok', N / SR, 'peak', float(np.abs(mix).max()))
