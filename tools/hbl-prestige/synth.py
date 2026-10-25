"""Original score and sound design for the HBL Prestige film (128 BPM, D minor resolving to D major).
Follows the arc of the reference: a dark drone, a sub hit when the light comes on, liquid sounds and a riser,
an impact at 0:06.1 that starts the pulse (cuts every two beats), a drop-out to air for the hero card,
and a warm hit under the logo.
Writes mix.wav (48 kHz stereo float) to the folder given as the first argument, or next to this script."""
import os
import sys
import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
DUR = 23.5
N = int(SR * DUR)
BEAT = 60 / 128
rng = np.random.default_rng(11)
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))

# cut times, from src/shots.js
LIGHT, EMERGE, DROP, SILK, CONTACTS, POCKET = 2.3, 4.3, 6.1, 7.0375, 7.975, 8.9125
LOGO, MARK, PAIR, CROSS, GAP, FACE, OUTRO, HERO, END = 9.85, 10.7875, 11.725, 13.6, 14.85, 15.006, 16.95, 17.0, 20.6


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
    """Time-varying filter in the STFT domain. centers: centre/cutoff Hz per sample."""
    nper = 1024
    f, ts, Z = signal.stft(x, SR, nperseg=nper)
    idx = np.clip((ts * SR).astype(int), 0, len(centers) - 1)
    c = centers[idx][None, :]
    ff = f[:, None]
    if kind == 'band':
        m = np.exp(-0.5 * ((ff - c) / (c / q)) ** 2)
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
    d = 0.45
    t = tt(d)
    f = 46 + 95 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
    click = sos_filter(noise(d), 'high', 3000) * np.exp(-t / 0.003) * 0.25
    return np.tanh((body + click) * 1.5) * 0.9 * gain


def snap(gain=1.0):
    d = 0.3
    t = tt(d)
    n = sos_filter(noise(d), 'band', [1400, 5200])
    e = np.exp(-t / 0.045) + 0.6 * (t >= 0.008) * np.exp(-np.clip(t - 0.008, 0, None) / 0.012)
    return n * e * 0.45 * gain


def hat(gain=1.0, d=0.07, tau=0.018):
    t = tt(d)
    return sos_filter(noise(d), 'high', 8000) * np.exp(-t / tau) * 0.3 * gain


def metal_tick(gain=1.0, f=1800):
    """Short inharmonic ping, like a fingernail on a metal card."""
    d = 0.35
    t = tt(d)
    y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / tau) for m, a, tau in [(1, 1, 0.09), (2.41, 0.6, 0.05), (3.93, 0.4, 0.03), (5.37, 0.25, 0.02)])
    return y * 0.3 * gain


def boom(d=2.0, f0=37, gain=1.0):
    t = tt(d)
    f = f0 + 60 * np.exp(-t / 0.07)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (d / 3.0))
    y += sos_filter(noise(d), 'low', 600) * np.exp(-t / 0.09) * 0.5
    return np.tanh(y * 1.5) * gain


def impact(gain=1.0, ring=220):
    """Sub drop + transient + a metallic ring that hangs in the reverb."""
    d = 3.0
    t = tt(d)
    sub = np.sin(2 * np.pi * np.cumsum(32 + 70 * np.exp(-t / 0.09)) / SR) * np.exp(-t / 0.9)
    hit = sos_filter(noise(d), 'band', [150, 3500]) * np.exp(-t / 0.035)
    metal = sum(a * np.sin(2 * np.pi * ring * m * t + m) * np.exp(-t / tau) for m, a, tau in [(1, 0.5, 1.2), (2.32, 0.35, 0.7), (3.9, 0.25, 0.4), (5.1, 0.15, 0.25), (6.8, 0.1, 0.15)])
    return np.tanh((sub * 1.1 + hit * 0.7 + metal * 0.35) * 1.3) * 0.8 * gain


def whoosh(d=0.45, f0=300, f1=4500, gain=1.0, up=True):
    n = int(d * SR)
    t = np.linspace(0, 1, n)
    shape = np.sin(np.pi * t) ** 2 if up else np.sin(np.pi * (1 - t) ** 0.6) ** 2
    cen = f0 * (f1 / f0) ** (np.sin(np.pi * t * 0.5) if up else t)
    y = sweep_filter(noise(d), cen, q=1.2) * shape
    return y / (np.abs(y).max() + 1e-9) * 0.5 * gain


def riser(d=1.5, gain=1.0, f0=110, f1=880):
    n = int(d * SR)
    t = np.linspace(0, 1, n)
    nz = sweep_filter(noise(d), 300 * (9000 / 300) ** t, q=1.0)
    nz /= np.abs(nz).max() + 1e-9
    f = f0 * (f1 / f0) ** (t ** 1.7)
    tone = sos_filter(polyblep_saw(f, d) * 0.22 + polyblep_saw(f * 1.006, d, 0.3) * 0.22, 'low', 2600)
    return (nz * 0.55 + tone) * (t ** 2.4) * gain


def rev_swell(d=0.7, gain=1.0):
    t = tt(d)
    x = (sos_filter(noise(d), 'high', 3500) * np.exp(-t / 0.5) + sos_filter(noise(d), 'band', [600, 3000]) * np.exp(-t / 0.25) * 0.5)[::-1]
    return x * 0.35 * gain


def bell(f, d=1.6, gain=1.0):
    t = tt(d)
    y = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / tau) for m, a, tau in [(1, 1, 0.7), (2.0, 0.35, 0.45), (2.76, 0.3, 0.25), (5.4, 0.15, 0.09)])
    return y * 0.32 * gain


def sparkle(d=0.6, gain=1.0, notes=('D6', 'F#6', 'A6', 'D7', 'E7')):
    out = np.zeros(int((d + 0.5) * SR))
    for k in range(10):
        o = int(rng.uniform(0, d) * SR)
        b = bell(hz(rng.choice(notes)), 0.4, 0.45)
        out[o:o + len(b)] += b
    return out * gain


def gloop(f0=180, f1=520, d=0.18, gain=1.0):
    """A thick liquid bubble: a sine that bends up as the bubble pops."""
    t = tt(d)
    f = f0 + (f1 - f0) * (t / d) ** 1.8
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 1.5
    return sos_filter(y, 'low', 1800) * 0.6 * gain


def sizzle(d=0.6, gain=1.0):
    t = tt(d)
    crackle = (rng.random(len(t)) < 0.004) * rng.uniform(0.3, 1.0, len(t))
    crackle = sos_filter(crackle, 'band', [2500, 9000]) * 6
    hiss = sos_filter(noise(d), 'high', 5000) * 0.25
    return (crackle + hiss) * np.exp(-t / (d / 2.5)) * gain


def servo(d=0.6, gain=1.0):
    t = tt(d)
    f = 220 + 160 * np.sin(np.pi * t / d)
    y = sos_filter(polyblep_saw(f, d), 'band', [500, 2200]) * np.sin(np.pi * t / d) ** 2
    return y * 0.12 * gain


def thump(gain=1.0):
    d = 0.7
    t = tt(d)
    y = np.sin(2 * np.pi * np.cumsum(55 + 40 * np.exp(-t / 0.05)) / SR) * np.exp(-t / 0.18)
    y += sos_filter(noise(d), 'low', 400) * np.exp(-t / 0.06) * 0.5
    return np.tanh(y * 1.4) * 0.8 * gain


def foam(d=0.8, gain=1.0):
    """Soft material giving way: low noise swelling and settling, with a rubbery wobble."""
    t = tt(d)
    y = sos_filter(noise(d), 'low', 350) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    y += np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.25) * (1 + 0.5 * np.sin(2 * np.pi * 9 * t)) * 0.3
    return y * 0.6 * gain


def crackle(d, gain=1.0, rate=0.0012):
    t = tt(d)
    c = (rng.random(len(t)) < rate) * rng.uniform(0.2, 1.0, len(t))
    return sos_filter(c, 'band', [1500, 6000]) * 4 * gain


def chord(notes, d, cutoff=1800, detune=(-0.08, 0, 0.08), attack=0.25, release=0.6, gain=1.0):
    seg = np.zeros((int(d * SR), 2))
    for nt in notes:
        for k, det in enumerate(detune):
            w = polyblep_saw(hz(nt) * 2 ** (det / 12), d, rng.uniform())
            seg[:, k % 2] += w * 0.1
            seg[:, (k + 1) % 2] += w * 0.04
    seg = sos_filter(sos_filter(seg, 'low', cutoff), 'high', 90)
    t = tt(d)
    e = np.minimum(1, t / attack) * np.minimum(1, (d - t) / release)
    return seg * e[:, None] * gain


def soft_pad(notes, d, attack=1.2, release=1.5, gain=1.0, bright=900):
    """Sine/triangle-ish pad for the quiet sections."""
    seg = np.zeros((int(d * SR), 2))
    t = tt(d)
    for i, nt in enumerate(notes):
        f = hz(nt)
        for c, det in enumerate((-0.04, 0.04)):
            ph = rng.uniform(0, 2 * np.pi)
            seg[:, c] += (np.sin(2 * np.pi * f * 2 ** (det / 12) * t + ph) + 0.25 * np.sin(2 * np.pi * 2 * f * t + ph)) * 0.12
    seg += chord(notes, d, cutoff=bright, attack=attack, release=release) * 0.35
    e = np.minimum(1, t / attack) * np.minimum(1, np.clip(d - t, 0, None) / release)
    return seg * e[:, None] * gain


# ---------------- music ----------------
music = buf()
T = np.arange(N) / SR

# 0–6.1: drone. D1 sub and a low fifth, closed at first, opening when the light comes on at 2.3 s.
drone_d = DROP + 0.4
drone = np.zeros((int(drone_d * SR), 2))
dt_ = tt(drone_d)
for nt, g in [('D2', 0.5), ('A2', 0.45), ('D3', 0.4), ('F3', 0.25), ('A3', 0.2)]:
    for c, det in enumerate((-0.06, 0.06)):
        drone[:, c] += polyblep_saw(hz(nt) * 2 ** (det / 12), drone_d, rng.uniform()) * g * 0.32
cut = np.interp(dt_, [0, LIGHT - 0.1, LIGHT + 0.6, EMERGE, DROP - 0.6, DROP], [700, 800, 1400, 900, 2000, 2600])
drone = np.stack([sweep_filter(drone[:, c], cut, kind='low') for c in range(2)], 1)
# the sub only arrives with the light, as in the reference
sub_g = np.interp(dt_, [0, LIGHT - 0.2, LIGHT + 0.3], [0.08, 0.1, 0.35])
drone[:, 0] += np.sin(2 * np.pi * hz('D1') * dt_) * sub_g
drone[:, 1] += np.sin(2 * np.pi * hz('D1') * dt_ + 0.3) * sub_g
drone *= (np.clip(dt_ / 1.6, 0, 1) * np.clip((drone_d - dt_) / 0.35, 0, 1))[:, None]
place(music, drone.astype(np.float32), 0.0, 0.8)
# air: a slow breath of band-passed noise
air_d = HERO
air = sweep_filter(noise(air_d), 4200 + 1800 * np.sin(np.arange(int(air_d * SR)) / SR * 0.7), q=1.4)
air *= np.clip(np.arange(len(air)) / SR / 2.0, 0, 1) * 0.05
place(music, air.astype(np.float32), 0.0, 1.0, -0.2)

# 6.1–16.95: the pulse
chords = [  # one bar each (4 beats = 1.875 s)
    (['D3', 'F3', 'A3', 'D4'], 'D1'),
    (['A#2', 'D3', 'F3', 'A#3'], 'A#0'),
    (['G2', 'A#2', 'D3', 'G3'], 'G0'),
    (['A2', 'C#3', 'E3', 'A3'], 'A0'),
    (['D3', 'F3', 'A3', 'D4'], 'D1'),
    (['A#2', 'D3', 'F3', 'A#3'], 'A#0'),
]
BAR = 4 * BEAT


def chord_at(t):
    return chords[min(len(chords) - 1, int((t - DROP) // BAR))]


def in_pulse(t):
    return DROP <= t < OUTRO and not (GAP - 0.02 <= t < FACE - 0.001)


sc = np.ones(N, np.float32)
n_beats = int((OUTRO - DROP) / BEAT) + 1
for i in range(n_beats):
    t = DROP + i * BEAT
    if not in_pulse(t):
        continue
    place(music, kick(0.95 if i % 4 == 0 else 0.8), t)
    a = int(t * SR)
    d = np.arange(min(int(0.4 * SR), N - a)) / SR
    sc[a:a + len(d)] = np.minimum(sc[a:a + len(d)], 1 - 0.7 * np.exp(-d / 0.1))
    # sub: the chord root, pumping under the kick
    _, root = chord_at(t)
    sd = BEAT * 0.95
    w = np.sin(2 * np.pi * hz(root) * 2 * tt(sd)) * np.minimum(1, tt(sd) / 0.06) * np.minimum(1, (sd - tt(sd)) / 0.05)
    place(music, (np.tanh(w * 1.6) * 0.42).astype(np.float32), t + 0.06)
    if i % 2 == 1:
        place(music, snap(0.75), t, 1.0, 0.05)
    # off-beat hats, then sixteenths once the cards appear
    place(music, hat(0.6), t + BEAT / 2, 1.0, 0.2)
    if t >= LOGO:
        for q in (1, 3):
            place(music, hat(0.25), t + q * BEAT / 4, 1.0, -0.25)
for b in range(6):
    t0 = DROP + b * BAR
    notes, _ = chords[b]
    d = min(BAR + 0.3, OUTRO + 0.4 - t0)
    seg = chord(notes, d, cutoff=1500 + 250 * b, attack=0.04, release=0.25)
    seg *= sc[int(t0 * SR):int(t0 * SR) + len(seg)][:, None] if int(t0 * SR) + len(seg) <= N else 1
    place(music, seg.astype(np.float32), t0, 0.85)
# arpeggio of the chord tones, high and quiet, from the logo shot on
step = BEAT / 4
i = 0
t = LOGO
while t < OUTRO - 0.05:
    if in_pulse(t):
        notes, _ = chord_at(t)
        seq = [notes[0], notes[2], notes[1], notes[3], notes[2], notes[1], notes[3], notes[2]]
        f = hz(seq[i % 8]) * 4
        b = bell(f, 0.35, 0.5)
        place(music, b.astype(np.float32), t, 0.5 if i % 4 == 0 else 0.3, 0.4 if i % 2 else -0.4)
    i += 1
    t += step
# the gap before the face shot: everything stops for a breath
music[int(GAP * SR):int((FACE - 0.005) * SR)] *= 0.15

# 17–23.5: air. D major add9, then the logo chord
place(music, soft_pad(['D3', 'F#3', 'A3', 'E4'], END - HERO + 0.8, attack=0.9, release=0.8, bright=1200).astype(np.float32), HERO - 0.1, 0.9)
place(music, soft_pad(['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'], DUR - END + 0.1, attack=0.05, release=2.4, bright=1500).astype(np.float32), END, 0.7)

music = np.tanh(music * 1.05) * 0.85

# ---------------- sfx ----------------
sfx = buf()
P = lambda x, t, g=1.0, pan=0.0: place(sfx, np.asarray(x, np.float32), t, g, pan)
# rock
P(boom(3.0, 34, 1.0), LIGHT, 0.85)
P(whoosh(1.2, 120, 900, 0.8), LIGHT - 0.35, 0.35)
rumble = sos_filter(noise(2.2), 'low', 110) * np.sin(np.linspace(0, np.pi, int(2.2 * SR))) ** 1.2
P(np.tanh(rumble * 2.0) * 0.5, LIGHT, 0.7)
P(crackle(1.9, 0.6), LIGHT + 0.2, 0.35, 0.3)
# emerge
P(whoosh(0.5, 2500, 300, 0.6, up=False), EMERGE - 0.05, 0.35)
P(gloop(150, 420, 0.32, 1.0), EMERGE + 0.15, 0.6, -0.3)
P(gloop(110, 300, 0.45, 0.8), EMERGE + 0.3, 0.45, -0.25)
P(gloop(200, 640, 0.22, 1.0), EMERGE + 0.75, 0.55, 0.35)
P(gloop(160, 480, 0.3, 0.7), EMERGE + 0.95, 0.35, 0.3)
P(riser(1.6, 1.0, 98, 784), DROP - 1.6, 0.6)
P(rev_swell(0.8, 1.2), DROP - 0.8, 0.7)
# the drop: molten metal
P(impact(1.0, 196), DROP, 1.0)
P(sizzle(0.8, 0.9), DROP + 0.02, 0.5, 0.2)
P(gloop(300, 900, 0.12, 0.8), DROP + 0.04, 0.4, -0.4)
P(gloop(260, 820, 0.12, 0.7), DROP + 0.09, 0.35, 0.4)
# silk
P(whoosh(0.9, 180, 1600, 0.9), SILK - 0.12, 0.45, -0.2)
# contacts: six pads locking in
P(servo(0.7, 1.0), CONTACTS, 0.6, 0.2)
for k in range(6):
    P(metal_tick(1.0, 1500 + 120 * k), CONTACTS + 0.13 + 0.07 * k, 0.55, -0.5 + 0.2 * k)
    P(hat(0.5, 0.03, 0.006), CONTACTS + 0.13 + 0.07 * k, 0.5, -0.5 + 0.2 * k)
# pocket: the chip drops into something soft
P(whoosh(0.3, 3000, 400, 0.7, up=False), POCKET - 0.05, 0.4)
P(thump(1.0), POCKET + 0.21, 0.8)
P(foam(0.9, 1.0), POCKET + 0.2, 0.55)
# logo / mark: light catching the copper, the glint on the mark
P(impact(0.5, 262), LOGO, 0.45)
P(sparkle(0.5, 1.0), LOGO + 0.35, 0.35, 0.3)
P(whoosh(0.4, 400, 6000, 0.6), MARK - 0.1, 0.35, 0.3)
P(bell(hz('A6'), 1.2, 0.9), MARK + 0.45, 0.3, -0.2)
P(sparkle(0.35, 0.8, ('A6', 'D7', 'E7')), MARK + 0.45, 0.3, -0.2)
# pair / cross
P(impact(0.9, 147), PAIR, 0.8)
P(whoosh(0.7, 250, 3000, 0.8), PAIR + 0.05, 0.4, -0.3)
P(whoosh(0.5, 600, 7000, 1.0), CROSS - 0.12, 0.55, 0.3)
P(metal_tick(0.8, 2400), CROSS + 0.02, 0.35, 0.3)
# the breath, then the face
P(rev_swell(0.6, 1.0), FACE - 0.6, 0.8)
P(impact(1.1, 196), FACE, 0.95)
P(riser(1.1, 0.7, 220, 880), FACE + 0.25, 0.25)
P(sparkle(0.7, 1.0), FACE + 0.9, 0.35, 0.25)
# outro: the music falls away to the hero card
P(whoosh(1.2, 3000, 200, 0.7, up=False), OUTRO - 0.2, 0.4)
P(boom(2.5, 37, 0.8), HERO, 0.4)
P(bell(hz('D6'), 2.0, 0.8), HERO + 2.0, 0.3, 0.35)
P(sparkle(0.4, 0.7, ('D7', 'F#7', 'A7')), HERO + 2.0, 0.25, 0.35)
# end: the logo
P(rev_swell(0.7, 1.0), END - 0.7, 0.6)
P(boom(3.5, 37, 1.0), END, 0.45)
P(bell(hz('D5'), 3.0, 1.0), END, 0.4, -0.15)
P(bell(hz('A5'), 3.0, 0.8), END + 0.03, 0.3, 0.15)
P(bell(hz('F#5'), 3.0, 0.6), END + 0.06, 0.22, 0.0)


# ---------------- reverb ----------------
def reverb_ir(d=3.2, rt=2.6):
    t = tt(d)
    ir = rng.standard_normal((len(t), 2)) * np.exp(-6.9 * t / rt)[:, None]
    ir = sos_filter(ir, 'low', 5000)
    ir[: int(0.02 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum())


IR = reverb_ir()


def wet(x, amt):
    y = np.stack([signal.fftconvolve(x[:, c], IR[:, c])[:N] for c in range(2)], 1)
    return x + y * amt


music = wet(music, 0.22)
sfx = wet(sfx, 0.32)

# ---------------- mixdown ----------------
music = sos_filter(music, 'high', 25) * 0.6
sfx = sos_filter(sfx, 'high', 28) * 0.8
mix = music + sfx
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.1) / np.tanh(1.1) * 0.89
fade = np.ones(N)
fl = int(0.9 * SR)
fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
mix *= fade[:, None]
sf.write(os.path.join(OUT, 'mix.wav'), mix.astype(np.float32), SR)
print('ok', N / SR, 'peak', float(np.abs(mix).max()))
