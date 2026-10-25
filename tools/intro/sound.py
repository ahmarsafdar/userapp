"""Instruments and sound effects shared by the intro soundtracks (synth.py here and in
tools/saas-intro). Everything is synthesised; nothing is sampled."""
import numpy as np
from scipy import signal

SR = 48000
BEAT = 0.5
rng = np.random.default_rng(7)


def buf(n):
    return np.zeros((n, 2), np.float32)


def place(dst, x, t, gain=1.0, pan=0.0):
    """Mix mono or stereo x into dst at time t (s)."""
    if x.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4)
        r = np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l * 1.414, x * r * 1.414], 1)
    i = int(round(t * SR))
    if i >= len(dst):
        return
    j0 = max(0, -i)
    i = max(0, i)
    n = min(len(x) - j0, len(dst) - i)
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
