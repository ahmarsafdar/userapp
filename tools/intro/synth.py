"""Original soundtrack + sound design for the Ahmar intro (120 BPM, A minor / C major).
Writes music.wav, sfx.wav and mix.wav (48 kHz stereo float) to the folder given as the
first argument, or next to this script."""
import os
import sys
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
DUR = 46.0
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))


def buf():
    return np.zeros((N, 2), np.float32)


def place(dst, x, t, gain=1.0, pan=0.0):
    """Mix mono or stereo x into dst at time t (s)."""
    if x.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], 1)
    i = int(round(t * SR))
    if i >= N:
        return
    j0 = max(0, -i)
    i = max(0, i)
    n = min(len(x) - j0, N - i)
    if n > 0:
        dst[i:i + n] += x[j0:j0 + n] * gain


def tt(d):
    return np.arange(int(d * SR)) / SR


def env_exp(d, tau, attack=0.002):
    t = tt(d)
    e = np.exp(-t / tau)
    a = int(attack * SR)
    if a > 0:
        e[:a] *= np.linspace(0, 1, a)
    return e


def sos_filter(x, kind, f, order=2):
    f = np.clip(np.atleast_1d(f), 20, SR / 2 - 100)
    sos = signal.butter(order, f if len(f) > 1 else f[0], btype=kind, fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def noise(d):
    return rng.standard_normal(int(d * SR))


def sweep_filter(x, centers, q=1.5, kind='band'):
    """Time-varying filter in the STFT domain. centers: array of centre/cutoff Hz per sample."""
    nper = 1024
    f, ts, Z = signal.stft(x, SR, nperseg=nper)
    idx = np.clip((ts * SR).astype(int), 0, len(centers) - 1)
    c = centers[idx][None, :]
    ff = f[:, None]
    if kind == 'band':
        bw = c / q
        m = np.exp(-0.5 * ((ff - c) / bw) ** 2)
    elif kind == 'low':
        m = 1 / (1 + (ff / c) ** 4)
    else:
        m = 1 - 1 / (1 + (ff / c) ** 4)
    _, y = signal.istft(Z * m, SR, nperseg=nper)
    return y[:len(x)]


def polyblep_saw(freq, d, phase0=0.0):
    n = int(d * SR)
    f = np.broadcast_to(np.asarray(freq, float), (n,)) if np.ndim(freq) else np.full(n, float(freq))
    dt = f / SR
    ph = (phase0 + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    tq = ph[m] / dt[m]
    y[m] -= tq + tq - tq * tq - 1
    m = ph > 1 - dt
    tq = (ph[m] - 1) / dt[m]
    y[m] -= tq * tq + tq + tq + 1
    return y


def hz(note):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = note[:-1], int(note[-1])
    return 440 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


# ---------------- instruments ----------------
def kick(gain=1.0):
    d = 0.5
    t = tt(d)
    f = 50 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.2)
    click = sos_filter(noise(d), 'high', 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * 0.9 * gain


def clap():
    d = 0.4
    n = sos_filter(noise(d), 'band', [900, 2600])
    t = tt(d)
    e = np.zeros_like(t)
    for k, o in enumerate([0, 0.011, 0.022]):
        e += (t >= o) * np.exp(-np.clip(t - o, 0, None) / (0.006 if k < 2 else 0.11))
    return n * e * 0.55


def snare(gain=1.0):
    d = 0.35
    t = tt(d)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.5
    nz = sos_filter(noise(d), 'high', 1200) * np.exp(-t / 0.13) * 0.6
    return (tone + nz) * gain


def hat(open_=False, gain=1.0):
    d = 0.35 if open_ else 0.08
    t = tt(d)
    x = sos_filter(noise(d), 'high', 7500)
    return x * np.exp(-t / (0.11 if open_ else 0.022)) * 0.3 * gain


def crash(gain=1.0):
    d = 2.5
    t = tt(d)
    x = sos_filter(noise(d), 'high', 4000) * np.exp(-t / 0.8)
    x2 = sos_filter(noise(d), 'band', [2500, 6000]) * np.exp(-t / 0.35) * 0.5
    return (x + x2) * 0.32 * gain


def boom(d=1.8, f0=55, gain=1.0):
    t = tt(d)
    f = f0 + 70 * np.exp(-t / 0.06)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (d / 3.2))
    y += sos_filter(noise(d), 'low', 900) * np.exp(-t / 0.08) * 0.6
    return np.tanh(y * 1.4) * gain


def whoosh(d=0.45, f0=300, f1=4500, gain=1.0, up=True):
    n = int(d * SR)
    t = np.linspace(0, 1, n)
    shape = np.sin(np.pi * t) ** 2 if up else np.sin(np.pi * (1 - t) ** 0.6) ** 2
    cen = f0 * (f1 / f0) ** (np.sin(np.pi * t * 0.5) if up else t)
    y = sweep_filter(noise(d), cen, q=1.2) * shape
    return y / (np.abs(y).max() + 1e-9) * 0.5 * gain


def whip(d=0.28, gain=1.0):
    n = int(d * SR)
    t = np.linspace(0, 1, n)
    cen = 600 * (7000 / 600) ** np.sin(np.pi * t)
    y = sweep_filter(noise(d), cen, q=2.0) * np.sin(np.pi * t) ** 1.5
    return y / (np.abs(y).max() + 1e-9) * 0.55 * gain


def riser(d=1.5, gain=1.0):
    n = int(d * SR)
    t = np.linspace(0, 1, n)
    nz = sweep_filter(noise(d), 400 * (9000 / 400) ** t, q=1.0)
    nz /= np.abs(nz).max() + 1e-9
    f = 180 * (1200 / 180) ** (t ** 1.6)
    tone = polyblep_saw(f, d) * 0.25
    tone = sos_filter(tone, 'low', 3000)
    y = (nz * 0.6 + tone) * (t ** 2.2)
    return y * gain


def rev_cymbal(d=0.6, gain=1.0):
    x = crash()[:int(d * SR)][::-1]
    return x * gain


def pop(f0=900, f1=300, d=0.09, gain=1.0):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035) * 0.6 * gain


def click(gain=1.0):
    d = 0.03
    t = tt(d)
    return (sos_filter(noise(d), 'band', [1800, 6000]) * np.exp(-t / 0.002) * 0.8 + np.sin(2 * np.pi * 2200 * t) * np.exp(-t / 0.006) * 0.3) * gain


def tick(f=2600, gain=1.0):
    d = 0.025
    t = tt(d)
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.004) * 0.5 * gain


def bell(f, d=1.2, gain=1.0):
    t = tt(d)
    y = np.zeros_like(t)
    for k, (m, a, tau) in enumerate([(1, 1, 0.5), (2.76, 0.4, 0.2), (5.4, 0.2, 0.08), (2.0, 0.3, 0.35)]):
        y += a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / tau)
    return y * 0.35 * gain


def sparkle(d=0.6, gain=1.0):
    out = np.zeros(int((d + 0.3) * SR))
    for k in range(9):
        o = int(rng.uniform(0, d) * SR)
        b = bell(rng.choice([2093, 2349, 2637, 3136, 3520, 4186]), 0.3, 0.5)
        out[o:o + len(b)] += b
    return out * gain


def blip_err(gain=1.0):
    out = np.zeros(int(0.22 * SR))
    for k, f in enumerate([520, 380]):
        d = 0.07
        t = tt(d)
        sq = np.sign(np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.04) * 0.25
        sq = sos_filter(sq, 'low', 3500)
        o = int(k * 0.08 * SR)
        out[o:o + len(sq)] += sq
    return out * gain


def slam(gain=1.0):
    d = 0.6
    t = tt(d)
    low = np.sin(2 * np.pi * np.cumsum(60 + 90 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.16)
    snap = sos_filter(noise(d), 'band', [1200, 5000]) * np.exp(-t / 0.03) * 0.6
    return np.tanh((low + snap) * 1.5) * 0.7 * gain


def ding(gain=1.0):
    out = np.zeros(int(1.2 * SR))
    for k, f in enumerate([hz('E6'), hz('A6')]):
        b = bell(f, 0.9)
        o = int(k * 0.09 * SR)
        out[o:o + len(b)] += b
    return out * gain


# ---------------- music ----------------
music = buf()
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
pad = buf()
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
sfx = buf()
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
