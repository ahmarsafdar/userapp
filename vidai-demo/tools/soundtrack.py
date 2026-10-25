"""Soundtrack for the Vid.AI film: a 124.45 BPM track plus sound design locked to picture.

The tempo was chosen so the film's big moments (drop, device swap, dive, spins,
outro) land on the beat grid. SFX sit exactly on their picture times (the same
numbers scene.js uses). Processing: scipy filters, pedalboard reverb, delay,
compression and limiting.

Run: python3 tools/soundtrack.py out/soundtrack.wav
"""
import sys

import numpy as np
import pedalboard as pb
from pedalboard.io import AudioFile
from scipy.signal import butter, sosfilt

SR = 48000
DUR = 33.6
N = int(SR * DUR)
rng = np.random.default_rng(11)

BPM = 124.45
BEAT = 60 / BPM
OFF = 0.114


def kt(k):
    """Time of beat index k on the film's grid (k may be fractional)."""
    return OFF + k * BEAT


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tv(d):
    return np.arange(int(round(d * SR))) / SR


# ------------------------------------------------------------------ buses
def bus():
    return np.zeros((N, 2))


B = {k: bus() for k in ("kick", "drums", "bass", "music", "sfx", "verb", "delay", "hits")}


def place(name, t, sig, gain=1.0, pan=0.0):
    """Mix mono or stereo sig into a bus at time t (seconds), equal-power pan."""
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)], axis=1) * np.sqrt(2)
    i = int(round(t * SR))
    if i < 0:
        sig = sig[-i:]
        i = 0
    n = min(len(sig), N - i)
    if n > 0:
        B[name][i:i + n] += sig[:n] * gain


# ------------------------------------------------------------------ DSP
def _sos(kind, fc, order=2, bw=1.6):
    nyq = SR * 0.48
    if kind == "band":
        lo, hi = max(20, fc / bw), min(nyq, fc * bw)
        return butter(order, [lo, hi], "band", fs=SR, output="sos")
    return butter(order, min(max(fc, 20), nyq), kind, fs=SR, output="sos")


def filt(x, kind, fc, order=2, bw=1.6):
    return sosfilt(_sos(kind, fc, order, bw), x, axis=0)


def sweep(x, fc, kind="low", order=2, bw=1.6, block=96):
    """Time-varying filter: fc is an array (one cutoff per sample)."""
    out = np.empty_like(x)
    zi = None
    for i in range(0, len(x), block):
        sos = _sos(kind, float(fc[min(i, len(fc) - 1)]), order, bw)
        seg = x[i:i + block]
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + seg.shape[1:])
        out[i:i + block], zi = sosfilt(sos, seg, axis=0, zi=zi)
    return out


def noise(d):
    return rng.standard_normal(int(round(d * SR)))


def norm(x):
    return x / (np.abs(x).max() + 1e-12)


def saw(f, n, ph0=None):
    """Band-limited (PolyBLEP) sawtooth; f is a scalar or per-sample array."""
    f = np.full(n, float(f)) if np.ndim(f) == 0 else np.asarray(f, float)[:n]
    dt = f / SR
    ph = ((rng.uniform() if ph0 is None else ph0) + np.cumsum(dt)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def supersaw(f, d, voices=7, detune=0.16, width=0.9):
    n = int(round(d * SR))
    out = np.zeros((n, 2))
    offs = np.linspace(-1, 1, voices)
    for o in offs:
        ff = f * 2 ** (o * detune / 12)
        s = saw(ff, n)
        a = (o * width + 1) * np.pi / 4
        out[:, 0] += s * np.cos(a)
        out[:, 1] += s * np.sin(a)
    return out / voices * 1.6


def env_adsr(n, a, d, s, r, hold):
    """Attack/decay/sustain for `hold` seconds, then release r; n total samples."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
    return e * np.where(t > hold, np.exp(-5 * rel), 1)


def fm_bell(f, d=1.6, ratio=3.5, index=2.2, decay=0.7):
    t = tv(d)
    idx = index * np.exp(-t / (decay * 0.35))
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * ratio * t))
    s += 0.25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / (decay * 0.4))
    return s * np.exp(-t / decay) * np.minimum(1, t / 0.0015)


def pan_stereo(x, pans):
    a = (pans + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1) * np.sqrt(2)


# ------------------------------------------------------------------ drum kit
def kick():
    t = tv(0.55)
    f = 46 + 115 * np.exp(-t * 30) + 60 * np.exp(-t * 160)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10.5)
    knock = filt(noise(0.55), "band", 1800, 1, 2.2) * np.exp(-t * 260) * 0.35
    click = filt(noise(0.55), "high", 5000) * np.exp(-t * 1400) * 0.25
    k = np.tanh(2.4 * (body + knock + click))
    return filt(k, "high", 28) * 0.95


KICK = kick()


def clap():
    d = 0.4
    t = tv(d)
    nz = filt(noise(d), "band", 1700, 2, 2.0)
    env = np.zeros(len(t))
    for i, o in enumerate((0, 0.008, 0.017, 0.026)):
        env += np.where(t >= o, np.exp(-(t - o) / (0.006 if i < 3 else 0.1)), 0)
    body = np.sin(2 * np.pi * 210 * t) * np.exp(-t * 45) * 0.35
    return norm(nz * env + body)


CLAP = clap()


def metal(d, dec, hp=7000):
    """808-style metallic noise from six detuned squares."""
    t = tv(d)
    s = sum(np.sign(np.sin(2 * np.pi * f * 1.9 * t + rng.uniform(0, 6))) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    s = filt(s, "band", 9500, 2, 1.7) + filt(noise(d), "high", hp) * 0.5
    return norm(filt(s, "high", hp) * np.exp(-t / dec))


HAT_C = metal(0.09, 0.018)
HAT_O = metal(0.4, 0.09)
SHAKER = norm(filt(noise(0.07), "band", 6500, 2, 1.8) * np.exp(-tv(0.07) / 0.02) * np.minimum(1, tv(0.07) / 0.012))
CRASH = norm(metal(2.6, 0.75, 4000) + filt(noise(2.6), "high", 3500) * np.exp(-tv(2.6) / 0.9) * 0.6)


def snare():
    t = tv(0.3)
    nz = filt(noise(0.3), "band", 3200, 2, 2.4) * np.exp(-t / 0.07)
    tone = np.sin(2 * np.pi * (190 + 60 * np.exp(-t * 40)) * t) * np.exp(-t / 0.05)
    return norm(nz + 0.6 * tone)


SNARE = snare()


# ------------------------------------------------------------------ sound design
def whoosh(din, dout, lo=250, hi=6500, pan_from=-0.6, pan_to=0.6, air=0.5):
    """Swept band-pass noise that rises to a peak at din then falls, panning across."""
    d = din + dout
    t = tv(d)
    n = len(t)
    up = np.clip(t / din, 0, 1)
    down = np.clip((t - din) / dout, 0, 1)
    shape = np.where(t < din, up ** 1.7, 1 - 0.55 * down ** 0.8)
    fc = lo * (hi / lo) ** shape
    body = sweep(noise(d), fc, "band", 1, 1.9)
    hiss = sweep(noise(d), fc * 2.2, "band", 1, 2.2) * air
    env = np.where(t < din, up ** 2.4, np.exp(-down * 4.5))
    mono = norm(body + hiss) * env
    pans = pan_from + (pan_to - pan_from) * np.clip(t / d, 0, 1)
    return pan_stereo(mono, pans)[:n]


def impact(sub=1.0, d=2.2):
    t = tv(d)
    f = 30 + 70 * np.exp(-t * 7)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.1) * sub
    thump = filt(noise(d), "low", 220, 2) * np.exp(-t * 28) * 1.6
    crack = filt(noise(d), "band", 4200, 2, 2.2) * np.exp(-t * 90) * 0.5
    return np.tanh(1.7 * (s + thump + crack))


def riser(d, f0=400, f1=9000, tone=True):
    t = tv(d)
    u = t / d
    nz = sweep(noise(d), f0 * (f1 / f0) ** (u ** 1.4), "band", 1, 1.8) * u ** 2.2
    out = np.stack([nz, np.roll(nz, 37)], axis=1)
    if tone:
        f = midi(55) * 2 ** (u ** 1.6)  # G3 rising an octave
        ss = supersaw(f, d, voices=5, detune=0.25)
        ss = sweep(ss, 300 + 5000 * u ** 2, "low", 2)
        out += ss * (u ** 2)[:, None] * 0.45
    return norm(out) * np.minimum(1, (d - t) / 0.01)[:, None]


def zip_(f0, f1, d=0.08):
    t = tv(d)
    f = f0 * (f1 / f0) ** (t / d)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * saw(f * 2, len(t))
    return s * np.sin(np.pi * t / d) ** 0.6


def pop(f, d=0.12):
    t = tv(d)
    ff = f * (1 + 1.4 * (1 - np.exp(-t / 0.012)))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.minimum(1, t / 0.002) * np.exp(-t / 0.035)


def ui_click(bright=1.0):
    t = tv(0.06)
    tick = filt(noise(0.06), "band", 6000, 2, 2.0) * np.exp(-t / 0.0012)
    tock = np.sin(2 * np.pi * (950 - 300 * t / 0.06) * t) * np.exp(-t / 0.007)
    s = tick * 0.9 * bright + tock * 0.7
    s[int(0.007 * SR):] += (tick[: len(t) - int(0.007 * SR)] * 0.35)  # release click
    return s


def key_tap():
    t = tv(0.05)
    hi = filt(noise(0.05), "band", rng.uniform(2800, 4200), 2, 1.9) * np.exp(-t / 0.0025)
    thock = np.sin(2 * np.pi * rng.uniform(260, 360) * t) * np.exp(-t / 0.009)
    return hi * 0.8 + thock * 0.55


def tink(f):
    t = tv(0.5)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t / 0.05)
    return s * np.exp(-t / 0.11) * np.minimum(1, t / 0.001)


def tick_tock(high):
    t = tv(0.08)
    f = 2400 if high else 1700
    s = filt(noise(0.08), "band", f, 2, 1.5) * np.exp(-t / 0.004) + np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / 0.012) * 0.5
    return s


def shimmer(d, notes, density=26, start_slow=False):
    """Granular sparkle from short sine grains on the given notes."""
    out = np.zeros((int(d * SR) + int(0.2 * SR), 2))
    for _ in range(density):
        u = rng.uniform() ** (0.6 if start_slow else 1.0)
        t0 = u * d
        f = midi(rng.choice(notes))
        g = tv(rng.uniform(0.05, 0.12))
        grain = np.sin(2 * np.pi * f * g) * np.hanning(len(g)) * rng.uniform(0.4, 1.0)
        a = (rng.uniform(-0.9, 0.9) + 1) * np.pi / 4
        i = int(t0 * SR)
        out[i:i + len(g), 0] += grain * np.cos(a)
        out[i:i + len(g), 1] += grain * np.sin(a)
    return out


def reverse_swell(sig, length=1.4, room=0.92):
    """Reverb of sig, reversed, so it swells into the moment it is placed before."""
    if sig.ndim == 1:
        sig = np.stack([sig, sig], axis=1)
    pad = np.concatenate([sig, np.zeros((int(length * SR), 2))])
    wet = pb.Reverb(room_size=room, damping=0.3, wet_level=1.0, dry_level=0.0, width=1.0)(pad.T.astype(np.float32), SR).T
    return norm(wet[::-1].astype(np.float64))


def place_before(name, t_end, sig, gain=1.0):
    place(name, t_end - len(sig) / SR, sig, gain)


# ------------------------------------------------------------------ harmony
CH = {
    "Am9": ([57, 60, 64, 67, 71], 45),
    "Fmaj9": ([53, 57, 60, 64, 67], 41),
    "C": ([55, 60, 64, 67, 72], 36),
    "G6": ([55, 59, 62, 64, 69], 43),
    "Gsus": ([55, 60, 62, 67, 74], 43),
}
PENT = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93]


def pad(chord, t0, t1, fc0=900, fc1=2600, gain=0.16, attack=0.35, release=0.9):
    notes, _ = CH[chord]
    d = t1 - t0 + release
    n = int(round(d * SR))
    acc = np.zeros((n, 2))
    for m in notes:
        acc += supersaw(midi(m), d, voices=7, detune=0.14)
    fc = np.geomspace(fc0, fc1, n)
    acc = sweep(acc, fc, "low", 2)
    e = env_adsr(n, attack, 1.0, 1.0, release, t1 - t0)
    place("music", t0, acc * e[:, None], gain)
    place("verb", t0, acc * e[:, None], gain * 0.45)


def pluck(m, t, gain, pan):
    d = 0.42
    s = supersaw(midi(m), d, voices=3, detune=0.08, width=0.4)
    tt = tv(d)
    s = sweep(s, 900 + 9000 * np.exp(-tt / 0.07), "low", 2)
    s *= (np.minimum(1, tt / 0.002) * np.exp(-tt / 0.13))[:, None]
    mono_pan = s * np.array([np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)]) * np.sqrt(2)
    place("music", t, mono_pan, gain)
    place("delay", t, mono_pan, gain * 0.55)
    place("verb", t, mono_pan, gain * 0.35)


def bass_note(m, t, d, gain):
    n = int(round(d * SR))
    tt = np.arange(n) / SR
    f = midi(m)
    s = saw(f, n) * 0.6 + np.sign(np.sin(2 * np.pi * f * tt)) * 0.25
    s = sweep(s, 160 + 520 * np.exp(-tt / 0.045), "low", 2)
    sub = np.sin(2 * np.pi * f * tt) * 0.55
    e = np.minimum(1, tt / 0.003) * np.minimum(1, (d - tt) / 0.012).clip(0, 1)
    place("bass", t, np.tanh(1.05 * (s + sub)) * e, gain)


def stab(chord, t, gain=0.22, d=1.2):
    notes, _ = CH[chord]
    acc = sum(supersaw(midi(m + 12), d, voices=7, detune=0.2) for m in notes[1:]) + supersaw(midi(notes[0]), d, 7, 0.2)
    tt = tv(d)
    acc = sweep(acc, 500 + 9000 * np.exp(-tt / 0.18), "low", 2)
    acc *= (np.minimum(1, tt / 0.003) * np.exp(-tt / 0.45))[:, None]
    place("music", t, acc, gain)
    place("verb", t, acc, gain * 0.8)
    place("delay", t, acc, gain * 0.3)


# ------------------------------------------------------------------ arrangement
# Intro, 0 to 4.45 s: ticking clock, the turn, the riser, the logo
pad("Am9", 0.0, 1.86, 400, 1100, gain=0.12, attack=1.0, release=0.4)
pad("Fmaj9", 1.84, 2.82, 900, 1800, gain=0.14, attack=0.04, release=0.2)
pad("Gsus", 2.80, 3.86, 1400, 5200, gain=0.15, attack=0.05, release=0.08)
for i in range(7):
    tt = kt(i * 0.5)
    if tt > 1.7:
        break
    place("sfx", tt, tick_tock(i % 2 == 0), 0.12, pan=0.25 if i % 2 else -0.25)
    place("verb", tt, tick_tock(i % 2 == 0), 0.12)
place("sfx", 0.06, whoosh(0.12, 0.45, 1500, 9000, -0.3, 0.3, 0.8), 0.16)
place("sfx", 1.6, whoosh(0.12, 0.25, 1200, 8000, 0.4, -0.2), 0.12)                     # line blurs out
place("hits", 1.86, impact(0.45, 1.6), 0.3)                                            # "Not"
place_before("sfx", 1.86, reverse_swell(CRASH[: int(0.5 * SR)], 0.9), 0.1)
place("sfx", 2.2, whoosh(0.07, 0.22, 1500, 9000, -0.5, 0.5, 0.9), 0.24)              # "anymore." flips up
place("sfx", 2.70, zip_(2600, 260, 0.07), 0.12, pan=-0.1)                              # squash to a line
place("sfx", 2.80, zip_(260, 1800, 0.09), 0.12, pan=0.1)                               # opens as "Meet"
place("sfx", 2.84, pop(midi(76)), 0.18)
place("sfx", 2.92, riser(1.0, 500, 11000), 0.34)
for i, k in enumerate(np.arange(6.0, 7.9, 0.25)):
    place("drums", kt(k), SNARE, 0.06 + 0.16 * i / 8, pan=0.05)
place("sfx", 3.42, shimmer(0.55, PENT, 34), 0.12)                                       # logo opens
place("verb", 3.42, shimmer(0.55, PENT, 34), 0.12)
place("hits", 3.92, impact(1.0, 2.4), 0.62)                                           # logo lands
place("drums", 3.92, CRASH, 0.2)
stab("C", 3.92, 0.26)
place_before("sfx", kt(9), reverse_swell(CRASH[: int(0.4 * SR)], 0.5), 0.2)           # suck into the drop

# Groove, from the drop to the silence before the end title
GROOVE = [9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53]
PROG = ["Am9", "Fmaj9", "C", "G6"]
END_GROOVE = 26.30
kicks = []
for bi, b0 in enumerate(GROOVE):
    beats = 2 if b0 == 53 else 4
    chord = PROG[bi % 4] if b0 != 53 else "G6"
    t0, t1 = kt(b0), min(kt(b0 + beats), END_GROOVE)
    inside = 21 <= b0 < 25        # just inside the app: thinner
    build = b0 == 37              # Generate press builds into the flip
    pad(chord, t0, t1, 2200, 3600 if not build else 7000, gain=0.085, attack=0.02, release=0.25)
    notes, root = CH[chord]
    tones = sorted(notes)[1:] + [notes[1] + 12]
    patt = [(0, 0), (3, 2), (6, 1), (8, 3), (10, 2), (11, 0), (14, 4)]
    for step, idx in patt:
        if step >= beats * 4:
            continue
        tt = kt(b0 + step / 4)
        if tt >= END_GROOVE:
            continue
        pluck(tones[idx % len(tones)] + 12, tt, 0.085 if not inside else 0.06, pan=-0.35 if step % 2 else 0.35)
    for q in range(beats):
        tb = kt(b0 + q)
        if tb >= END_GROOVE:
            continue
        if not (build and q == 3 and b0 + q >= 40):
            place("kick", tb, KICK, 0.8)
            kicks.append(tb)
        if q % 2 == 1 and not inside:
            place("drums", tb, CLAP, 0.34, pan=0.04)
            place("verb", tb, CLAP, 0.12)
        toff = kt(b0 + q + 0.5)
        if toff < END_GROOVE:
            bass_note(root + 12 if root < 40 else root, toff, BEAT * 0.45, 0.30)
            place("drums", toff, HAT_O if not inside else HAT_C, 0.2 if not inside else 0.15, pan=0.25)
        for s16 in (0.25, 0.75):
            ts = kt(b0 + q + s16)
            if ts < END_GROOVE:
                place("drums", ts, HAT_C, 0.11, pan=-0.3)
                place("drums", ts, SHAKER, 0.08, pan=0.5)
# build: snare roll into the flip at 19.6
for i, k in enumerate(np.arange(38.0, 40.42, 0.25)):
    place("drums", kt(k), SNARE, 0.05 + 0.2 * (i / 10) ** 1.5, pan=0.05)
place("sfx", 18.32, riser(1.28, 600, 12000), 0.3)

# Hero section SFX
place("drums", kt(9), CRASH, 0.24)
place("hits", kt(9), impact(0.7, 1.8), 0.42)
place("sfx", 4.42, whoosh(0.2, 0.55, 300, 7000, -0.7, 0.4), 0.42)                      # phone spins in
for i, (dt, m) in enumerate([(4.56, 79), (4.62, 84), (4.68, 81), (4.74, 86), (4.8, 88), (4.86, 91), (4.66, 76)]):
    place("sfx", dt + 0.06, pop(midi(m)), 0.12, pan=(-0.7, 0.7, -0.6, 0.6, 0.3, -0.3, 0.8)[i])
    place("verb", dt + 0.06, pop(midi(m)), 0.08)
place("sfx", 7.18, whoosh(0.18, 0.5, 250, 6000, 0.6, -0.5), 0.4)                       # phone to laptop
place("drums", 7.36, CRASH, 0.14)
place("hits", 7.4, impact(0.5, 1.2), 0.28)
place("sfx", 7.4, shimmer(0.5, PENT, 18), 0.07)
place("sfx", 9.36, whoosh(0.42, 0.5, 200, 9000, -0.2, 0.2, 0.7), 0.5)                  # dive into the screen
place("sfx", 9.3, riser(0.48, 800, 14000, tone=False), 0.22)
place("hits", 9.78, impact(1.0, 2.0), 0.55)                                           # app lifts out
place("drums", 9.78, CRASH, 0.2)
for i, m in enumerate([88, 91, 96, 100]):
    place("sfx", 9.78 + i * 0.018, fm_bell(midi(m), 1.2, 3.0, 1.5, 0.5), 0.05, pan=(-0.5, 0.5, -0.2, 0.2)[i])
    place("verb", 9.78 + i * 0.018, fm_bell(midi(m), 1.2, 3.0, 1.5, 0.5), 0.06)

# App section SFX
place("sfx", 10.45, tink(midi(84)), 0.06, pan=-0.2)                                   # prompt focus
for i in range(53):
    place("sfx", 10.62 + i * (1.68 / 53) + rng.uniform(-0.007, 0.007), key_tap(), 0.16 * rng.uniform(0.6, 1.0), pan=rng.uniform(-0.25, 0.25))
place("sfx", 12.96, whoosh(0.16, 0.42, 300, 7500, -0.6, 0.6), 0.36)                    # 360 reframe
place("drums", 13.12, CRASH, 0.1)
place("hits", 13.16, impact(0.35, 1.0), 0.2)
CLICKS = [13.92, 14.62, 15.22, 16.42, 18.25, 22.52, 23.36, 24.32, 25.18]
for c in CLICKS:
    place("sfx", c, ui_click(), 0.26, pan=0.12)
    place("verb", c, ui_click(), 0.04)
for c, m in [(13.95, 84), (14.65, 86), (16.45, 88)]:                                  # selection confirms
    place("sfx", c, tink(midi(m)), 0.07, pan=0.2)
    place("delay", c, tink(midi(m)), 0.04)
for i in range(10):                                                                   # narrator preview blips
    place("sfx", 15.28 + i * BEAT / 2, pop(midi([60, 64, 67, 64][i % 4] + 12), 0.08), 0.035, pan=0.3)
place("sfx", 16.5, tink(midi(79)), 0.06)                                               # Generate becomes active
place("sfx", 16.58, tink(midi(84)), 0.06)
place("sfx", 18.27, shimmer(0.7, PENT, 30, start_slow=True), 0.1)                      # press Generate
place("sfx", 18.27, zip_(500, 2400, 0.35), 0.06)
place("verb", 18.27, shimmer(0.7, PENT, 30), 0.14)
for t_flip, pf, pt in [(19.6, 0.6, -0.6), (23.6, -0.6, 0.6)]:
    place("sfx", t_flip - 0.2, whoosh(0.2, 0.45, 280, 7000, pf, pt), 0.42)
    place("drums", t_flip, CRASH, 0.18)
    place("hits", t_flip + 0.04, impact(0.6, 1.4), 0.32)
for at, m in zip([20.05, 20.35, 20.65, 20.95, 21.2], [72, 74, 76, 79, 81]):             # checklist
    place("sfx", at, pop(midi(m + 12)), 0.13, pan=0.15)
    place("verb", at, pop(midi(m + 12)), 0.07)
for i, m in enumerate([79, 84, 88]):                                                   # video ready
    place("sfx", 21.47 + i * 0.07, fm_bell(midi(m), 1.4, 2.0, 1.2, 0.55), 0.06, pan=(i - 1) * 0.4)
    place("verb", 21.47 + i * 0.07, fm_bell(midi(m), 1.4, 2.0, 1.2, 0.55), 0.06)
t = tv(0.4)                                                                            # export progress tone
prog = np.sin(2 * np.pi * np.cumsum(midi(72) * 2 ** (t / 0.4)) / SR) * np.minimum(1, t / 0.02) * 0.6
place("sfx", 22.55, prog, 0.05)
place("sfx", 22.95, fm_bell(midi(91), 1.0, 2.0, 1.0, 0.4), 0.07)
place("sfx", 22.95, fm_bell(midi(96), 1.0, 2.0, 1.0, 0.4), 0.05)
place("sfx", 24.32, ui_click(1.3), 0.18, pan=0.3)                                     # toggle
place("sfx", 24.36, tink(midi(88)), 0.05, pan=0.3)

# Posted: the hard cut lands on a big hit
place("hits", 25.4, impact(1.0, 2.0), 0.55)
place("drums", 25.4, CRASH, 0.22)
stab("C", 25.4, 0.2)
for i, m in enumerate([84, 88, 91, 96]):
    place("sfx", 25.43 + i * 0.06, fm_bell(midi(m), 1.6, 2.0, 1.4, 0.6), 0.06, pan=(i - 1.5) * 0.35)
    place("verb", 25.43 + i * 0.06, fm_bell(midi(m), 1.6, 2.0, 1.4, 0.6), 0.07)
for i in range(22):                                                                    # view counter rolls
    u = 1 - (1 - (i + 1) / 22) ** (1 / 3)
    place("sfx", 25.52 + u * 0.78, tick_tock(True), 0.06 + 0.04 * (1 - i / 22), pan=0.1)

# Silence, then the end title
place("sfx", 26.3, whoosh(0.18, 0.5, 200, 3500, 0.2, -0.2, 0.3), 0.1)                # product defocuses
place_before("sfx", 26.62, reverse_swell(np.concatenate([CRASH[: int(0.3 * SR)]]), 1.0), 0.28)
place("hits", 26.62, impact(1.0, 2.6), 0.6)
stab("Fmaj9", 26.62, 0.12, 1.6)
pad("Fmaj9", 26.62, kt(59), 1200, 2200, gain=0.11, attack=0.08, release=0.6)
pad("G6", kt(59), kt(63.9), 1400, 3000, gain=0.11, attack=0.3, release=0.4)
OUT_MOTIF = [(55, 0, 84), (55.75, 0, 88), (56.5, 0, 91), (57.5, 0, 88), (59, 0, 86), (59.75, 0, 91), (60.5, 0, 93), (61.5, 0, 91)]
for k, _, m in OUT_MOTIF:
    pluck(m - 12, kt(k), 0.07, pan=0.3 if int(k * 2) % 2 else -0.3)
for k in range(55, 63, 1):
    bass_note(CH["Fmaj9"][1] + 12 if k < 59 else CH["G6"][1] + 12, kt(k), BEAT * 0.9, 0.14)
place("sfx", 28.03, shimmer(0.55, PENT[4:], 16), 0.06)                                 # tagline sweep
place("verb", 28.03, shimmer(0.55, PENT[4:], 16), 0.08)
place("sfx", 29.2, pop(midi(84)), 0.08)                                                # vid.ai
place("sfx", 30.0, riser(0.95, 600, 12000), 0.26)
place("sfx", 30.42, shimmer(0.55, PENT, 34), 0.11)                                     # logo opens
place("verb", 30.42, shimmer(0.55, PENT, 34), 0.12)
place("hits", 30.95, impact(1.0, 2.6), 0.6)
place("drums", 30.95, CRASH, 0.22)
stab("C", 30.95, 0.26, 2.0)
pad("C", 30.95, 33.0, 2400, 900, gain=0.12, attack=0.01, release=0.5)
for i, m in enumerate([72, 79, 84, 88, 91]):
    place("verb", 30.98 + i * 0.08, fm_bell(midi(m), 2.4, 2.0, 1.2, 0.9), 0.07)

# ------------------------------------------------------------------ mix
t_all = np.arange(N) / SR

# sidechain the bed under the kick
duck_bass, duck_music = np.ones(N), np.ones(N)
for tk in kicks:
    i = int(tk * SR)
    seg = np.exp(-tv(BEAT) / 0.1)
    n = min(len(seg), N - i)
    duck_bass[i:i + n] = np.minimum(duck_bass[i:i + n], 1 - 0.75 * seg[:n])
    duck_music[i:i + n] = np.minimum(duck_music[i:i + n], 1 - 0.4 * seg[:n])
B["bass"] *= duck_bass[:, None]
B["music"] *= duck_music[:, None]

# the groove stops dead for the silence before the end title
gate = np.interp(t_all, [0, END_GROOVE - 0.012, END_GROOVE, N / SR], [1, 1, 0, 0])
for k in ("kick", "drums", "bass"):
    B[k] *= gate[:, None]
mus_gate = np.where((t_all >= END_GROOVE) & (t_all < 26.6), 0.0, 1.0)
mus_gate = np.convolve(mus_gate, np.ones(480) / 480, mode="same")
B["music"] *= mus_gate[:, None]

# effects returns
verb = pb.Pedalboard([pb.HighpassFilter(250), pb.Reverb(room_size=0.86, damping=0.42, wet_level=1.0, dry_level=0.0, width=1.0), pb.LowpassFilter(9000)])
verb_ret = verb(B["verb"].T.astype(np.float32), SR).T
dl = B["delay"].T.astype(np.float32)
dl_l = pb.Pedalboard([pb.Delay(delay_seconds=BEAT * 0.75, feedback=0.32, mix=1.0), pb.LowpassFilter(5000)])(dl[:1], SR)
dl_r = pb.Pedalboard([pb.Delay(delay_seconds=BEAT * 0.5, feedback=0.32, mix=1.0), pb.LowpassFilter(5000)])(dl[1:], SR)
delay_ret = np.concatenate([dl_l, dl_r]).T

drum_bus = pb.Pedalboard([pb.Compressor(threshold_db=-14, ratio=3, attack_ms=6, release_ms=90)])(
    (B["drums"]).T.astype(np.float32), SR).T
music_bus = pb.Pedalboard([pb.HighpassFilter(140), pb.PeakFilter(3200, 3.5, 0.8)])(B["music"].T.astype(np.float32), SR).T
bass_bus = pb.Pedalboard([pb.LowpassFilter(1100), pb.PeakFilter(420, -3.0, 1.0)])(B["bass"].T.astype(np.float32), SR).T
sfx_bus = pb.Pedalboard([pb.HighpassFilter(60), pb.Compressor(threshold_db=-18, ratio=2, attack_ms=3, release_ms=80)])(B["sfx"].T.astype(np.float32), SR).T

def loud(x, t0=13.0, t1=17.5):
    """Rough perceptual level in dB: K-style weighting, RMS over a window."""
    seg = x[int(t0 * SR):int(t1 * SR)].T.astype(np.float32)
    w = pb.Pedalboard([pb.HighpassFilter(110), pb.HighShelfFilter(1600, 4.0, 0.7)])(seg, SR)
    return 20 * np.log10(np.sqrt((w ** 2).mean()) + 1e-9)


# gain-stage each group to a target level relative to the kick (dB, perceptual)
TARGET = {"bass": -5.0, "music": 1.0, "drums": -2.0, "delay": -10.0, "verb": -8.0}
STEMS = {"kick": B["kick"], "bass": bass_bus, "music": music_bus, "drums": drum_bus, "delay": delay_ret, "verb": verb_ret}
ref = loud(B["kick"])
for k, target in TARGET.items():
    g = 10 ** ((target - (loud(STEMS[k]) - ref)) / 20)
    STEMS[k] *= g
    print(f"  {k:6s} gain {20 * np.log10(g):+5.1f} dB")
bass_bus, music_bus, drum_bus, delay_ret, verb_ret = (STEMS[k] for k in ("bass", "music", "drums", "delay", "verb"))
beat_mix = B["kick"] + drum_bus + bass_bus + music_bus + delay_ret

# the dive: the music closes down as the camera goes into the screen, then opens on the lift-out
i0, i1 = int(9.0 * SR), int(10.1 * SR)
seg_t = t_all[i0:i1]
fc = np.where(seg_t < 9.78, np.interp(seg_t, [9.0, 9.4, 9.77], [19000, 9000, 650]), np.interp(seg_t, [9.78, 10.1], [19000, 19000]))
beat_mix[i0:i1] = sweep(beat_mix[i0:i1], fc, "low", 2)
# Generate builds: open the filter through the snare roll
i0, i1 = int(kt(37) * SR), int(19.6 * SR)
seg_t = t_all[i0:i1]
beat_mix[i0:i1] = sweep(beat_mix[i0:i1], np.geomspace(1800, 19000, i1 - i0), "low", 2)
# outro: filter the tail down as it fades
i0 = int(31.6 * SR)
beat_mix[i0:] = sweep(beat_mix[i0:], np.geomspace(18000, 500, N - i0), "low", 2)
verb_ret[i0:] = sweep(verb_ret[i0:], np.geomspace(14000, 900, N - i0), "low", 2)

def loud_max(x, t0=4.5, t1=26.2, win=0.4):
    """Max short-term (400 ms) perceptual level over a span, in dB."""
    seg = x[int(t0 * SR):int(t1 * SR)].T.astype(np.float32)
    w = pb.Pedalboard([pb.HighpassFilter(110), pb.HighShelfFilter(1600, 4.0, 0.7)])(seg, SR)
    p = (w ** 2).mean(0)
    k = int(win * SR)
    st = np.convolve(p, np.ones(k) / k, mode="valid")
    return 10 * np.log10(st.max() + 1e-12)


bed = loud(beat_mix + verb_ret)
bed_max = loud_max(beat_mix + verb_ret)
# SFX (whooshes, risers) peak 1.5 dB under the bed's loudest moments; impacts peak 1 dB over it
sfx_g = 10 ** ((bed_max - 1.5 - loud_max(sfx_bus)) / 20)
hits_g = 10 ** ((bed_max - 0.5 - loud_max(B["hits"])) / 20)
print(f"  sfx gain {20 * np.log10(sfx_g):+5.1f} dB, hits gain {20 * np.log10(hits_g):+5.1f} dB")
mix = beat_mix + verb_ret + sfx_bus * sfx_g + B["hits"] * hits_g
mix *= np.interp(t_all, [0, 0.02, 32.3, 33.5, N / SR], [0, 1, 1, 0, 0])[:, None]

GAIN_DB = float(sys.argv[2]) if len(sys.argv) > 2 else 5.4
master = pb.Pedalboard([
    pb.HighpassFilter(26),
    pb.LowShelfFilter(90, 1.5, 0.7),
    pb.HighShelfFilter(8500, 2.5, 0.7),
    pb.Compressor(threshold_db=-16, ratio=2.2, attack_ms=20, release_ms=160),
    pb.Gain(GAIN_DB),
    pb.Limiter(threshold_db=-1.6, release_ms=120),
])
mix = mix / (np.abs(mix).max() + 1e-9) * 0.5
out = master(mix.T.astype(np.float32), SR)
out = out / max(1e-9, np.abs(out).max()) * 10 ** (-1.6 / 20)   # sample peak at -1.6 dBFS (true peak stays under -1 after AAC)
print(f"  bed loudness ref {bed:.1f} dB")

path = sys.argv[1] if len(sys.argv) > 1 else "soundtrack.wav"
if len(sys.argv) > 3 and sys.argv[3] == "--stems":
    np.savez_compressed(path.replace(".wav", "_stems.npz"), kick=B["kick"].astype(np.float32), drums=drum_bus.astype(np.float32),
                        bass=bass_bus.astype(np.float32), music=music_bus.astype(np.float32), delay=delay_ret.astype(np.float32),
                        verb=verb_ret.astype(np.float32), sfx=(sfx_bus * sfx_g).astype(np.float32), hits=(B["hits"] * hits_g).astype(np.float32),
                        music_raw=B["music"].astype(np.float32))
with AudioFile(path, "w", SR, 2, bit_depth=24) as f:
    f.write(out)
print("wrote", path, f"{DUR}s @ {SR} Hz")
