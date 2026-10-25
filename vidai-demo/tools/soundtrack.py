"""Synthesize the film's soundtrack: a ~100 BPM bed plus SFX locked to the picture.

Cue times mirror scene.js. Run: python3 tools/soundtrack.py out/soundtrack.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 33.6
N = int(SR * DUR)
rng = np.random.default_rng(7)

music = np.zeros((N, 2))   # bed (ducked by the kick)
drums = np.zeros((N, 2))
sfx = np.zeros((N, 2))
wet = np.zeros((N, 2))     # send to reverb


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(buf, start_s, sig, gain=1.0, pan=0.0):
    """Mix a mono (n,) or stereo (n,2) signal into buf at start_s with equal-power pan."""
    i = int(round(start_s * SR))
    if i >= N:
        return
    if sig.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l, sig * r], axis=1) * np.sqrt(2)
    j0 = max(0, -i)
    sig = sig[j0:]
    i = max(0, i)
    n = min(len(sig), N - i)
    buf[i:i + n] += sig[:n] * gain


def tvec(d):
    return np.arange(int(d * SR)) / SR


def band_noise(d, lo, hi):
    n = int(d * SR)
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


# ------------------------------------------------------------------ instruments
def pad_note(f, d, rel=0.9):
    t = tvec(d + rel)
    out = np.zeros(len(t))
    for cents in (-7, 0, 7):
        ff = f * 2 ** (cents / 1200)
        ph = rng.uniform(0, 2 * np.pi, 12)
        for n in range(1, 11):
            out += (1 / n) * np.exp(-(n - 1) / 2.0) * np.sin(2 * np.pi * ff * n * t + ph[n])
    env = np.minimum(1, t / 0.45) * np.where(t < d, 1, np.exp(-(t - d) / (rel / 3)))
    # slow breathing movement
    env *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.35 * t + rng.uniform(0, 6))
    return out * env / 6


def bass_note(f, d):
    t = tvec(d)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    env = np.minimum(1, t / 0.006) * (0.45 + 0.55 * np.exp(-t / 0.12)) * np.minimum(1, (d - t) / 0.03)
    return s * env


def pluck(f, d=0.32):
    t = tvec(d)
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05) + 0.12 * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.03)
    return s * np.minimum(1, t / 0.003) * np.exp(-t / 0.09)


def kick():
    t = tvec(0.42)
    f = 44 + 95 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 8.5)
    s[:130] += rng.standard_normal(130) * np.linspace(0.5, 0, 130)
    return np.tanh(1.6 * s)


def clap():
    t = tvec(0.22)
    nz = band_noise(0.22, 900, 6000)
    env = np.zeros(len(t))
    for o in (0, 0.009, 0.019):
        env += np.where(t >= o, np.exp(-(t - o) / (0.008 if o < 0.019 else 0.06)), 0)
    return nz * env * 0.6


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    t = tvec(d)
    return band_noise(d, 7000, 16000) * np.exp(-t / (0.05 if open_ else 0.012))


def whoosh(d_in, d_out, lo=250, hi=6000):
    d = d_in + d_out
    t = tvec(d)
    env = np.where(t < d_in, (t / d_in) ** 2.2, np.exp(-(t - d_in) / (d_out / 3.5)))
    lowb = band_noise(d, lo, lo * 6) * np.where(t < d_in, (t / d_in) ** 1.6, np.exp(-(t - d_in) / (d_out / 3)))
    highb = band_noise(d, hi / 3, hi) * np.where(t < d_in, (t / d_in) ** 3.5, np.exp(-(t - d_in) / (d_out / 5)))
    return (0.7 * lowb + 0.5 * highb) * env


def impact(f0=75, f1=38, d=0.7):
    t = tvec(d)
    f = f1 + (f0 - f1) * np.exp(-t * 14)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
    s += band_noise(d, 60, 900) * np.exp(-t * 18) * 0.5
    return np.tanh(1.4 * s)


def boom():
    t = tvec(2.4)
    f = 36 + 24 * np.exp(-t * 6)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.7)
    s += band_noise(2.4, 40, 400) * np.exp(-t * 5) * 0.35
    s += band_noise(2.4, 2000, 9000) * np.exp(-t * 30) * 0.25
    return np.tanh(1.8 * s)


def click():
    t = tvec(0.05)
    s = 0.7 * np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.003) + np.sin(2 * np.pi * 1450 * t) * np.exp(-t / 0.008)
    return s


def tick():
    t = tvec(0.02)
    return band_noise(0.02, 2500, 9000) * np.exp(-t / 0.0025)


def pop(f):
    t = tvec(0.25)
    ff = f * (1 + 0.22 * np.minimum(1, t / 0.04))
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.minimum(1, t / 0.003) * np.exp(-t / 0.07)


def bell(f, d=2.0):
    t = tvec(d)
    s = np.zeros(len(t))
    for k, a, dec in ((1, 1, 0.9), (2.0, 0.5, 0.5), (3.01, 0.3, 0.3), (4.2, 0.18, 0.18)):
        s += a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / dec)
    return s * np.minimum(1, t / 0.002)


def riser(d):
    t = tvec(d)
    u = t / d
    nz = band_noise(d, 1500, 12000) * u ** 3
    f = 220 + 700 * u ** 2
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * u ** 2 * 0.25
    return (nz * 0.5 + tone) * np.minimum(1, (d - t) / 0.02)


# ------------------------------------------------------------------ the bed
BEAT = 0.6                 # 100 BPM
T0 = 4.45                  # first downbeat: the phone spins in
BAR = BEAT * 4
PROG = [  # (pad notes, bass root)
    ([53, 57, 60, 64, 67], 41),   # Fmaj9
    ([52, 55, 60, 64, 67], 40),   # C/E
    ([55, 59, 62, 67, 71], 43),   # G
    ([57, 60, 64, 69, 72], 45),   # Am
]
DROP_OUT, BACK_IN = 26.3, 26.62   # silence before the end title
END_FADE = (31.4, 33.45)


def groove_on(t):
    return T0 <= t < DROP_OUT


for k in range(-2, 13):
    bar_t = T0 + k * BAR
    if bar_t > 33.5:
        break
    notes, root = PROG[k % 4]
    start = max(0.0, bar_t)
    d = BAR - (start - bar_t)
    if d <= 0:
        continue
    for i, m in enumerate(notes):
        add(music, start, pad_note(midi(m), d), 0.11, pan=(i - 2) * 0.35)
        add(wet, start, pad_note(midi(m), d), 0.05, pan=(i - 2) * 0.35)
    # bass: driving 8ths in the groove, long notes in the outro
    if bar_t >= T0 and bar_t < DROP_OUT:
        for e in range(8):
            tt = bar_t + e * BEAT / 2
            if tt < DROP_OUT:
                add(music, tt, bass_note(midi(root + 12 * (e % 4 == 3)), BEAT / 2 * 0.95), 0.2)
    elif bar_t >= DROP_OUT - BAR:
        st = max(bar_t, BACK_IN)
        if st < bar_t + BAR:
            add(music, st, bass_note(midi(root), bar_t + BAR - st) * np.exp(-tvec(bar_t + BAR - st) / 1.2), 0.22)
    # arp: 16ths over chord tones, two octaves up
    arp = [notes[0], notes[2], notes[3], notes[4], notes[3], notes[2], notes[1], notes[2]]
    for s16 in range(16):
        tt = bar_t + s16 * BEAT / 4
        if tt < 3.95 or (DROP_OUT <= tt < BACK_IN) or tt > 31.2:
            continue
        g = 0.045 if groove_on(tt) else 0.03
        if tt > 29.6:
            g *= max(0, (31.2 - tt) / 1.6)
        sig = pluck(midi(arp[s16 % 8] + 12))
        add(music, tt, sig, g, pan=0.45 if s16 % 2 else -0.45)
        add(wet, tt, sig, g * 0.8, pan=0.45 if s16 % 2 else -0.45)

# drums
b = 0
while True:
    tt = T0 + b * BEAT
    if tt >= DROP_OUT:
        break
    add(drums, tt, kick(), 0.55)
    if b % 2 == 1:
        add(drums, tt, clap(), 0.2, pan=0.05)
        add(wet, tt, clap(), 0.06)
    add(drums, tt + BEAT / 2, hat(open_=(b % 4 == 3)), 0.07, pan=0.3)
    add(drums, tt + BEAT / 4, hat(), 0.03, pan=-0.3)
    add(drums, tt + 3 * BEAT / 4, hat(), 0.03, pan=-0.3)
    b += 1

# sidechain: duck the bed under each kick
duck = np.ones(N)
b = 0
while T0 + b * BEAT < DROP_OUT:
    i = int((T0 + b * BEAT) * SR)
    seg = 1 - 0.55 * np.exp(-tvec(BEAT) / 0.11)
    n = min(len(seg), N - i)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[:n])
    b += 1
music *= duck[:, None]

# ------------------------------------------------------------------ SFX on picture
add(sfx, 0.0, riser(3.9), 0.42)
add(sfx, 3.9, boom(), 0.55)
add(wet, 3.9, boom(), 0.15)
# hook type moves
for at, din, dout, g, pan in [(1.72, 0.1, 0.3, 0.16, 0), (2.2, 0.08, 0.25, 0.2, -0.2), (2.72, 0.06, 0.2, 0.18, 0.2), (3.3, 0.08, 0.2, 0.12, 0)]:
    add(sfx, at - din, whoosh(din, dout, 400, 9000), g, pan)
# spins and dives: (peak time, in, out, gain, pan)
for at, din, dout, g, pan in [(4.62, 0.2, 0.5, 0.42, -0.3), (7.36, 0.18, 0.45, 0.42, 0.3), (9.78, 0.36, 0.5, 0.5, 0.0),
                              (13.12, 0.17, 0.4, 0.4, -0.25), (19.6, 0.18, 0.4, 0.42, 0.25), (23.6, 0.18, 0.4, 0.42, -0.25),
                              (26.5, 0.2, 0.6, 0.2, 0.0)]:
    add(sfx, at - din, whoosh(din, dout), g, pan)
    add(wet, at - din, whoosh(din, dout), g * 0.3, pan)
for at, g in [(4.5, 0.5), (7.4, 0.4), (9.8, 0.55), (13.2, 0.35), (19.68, 0.4), (23.68, 0.4), (25.4, 0.55)]:
    add(sfx, at, impact(), g)
# cursor
for c in [13.92, 14.62, 15.22, 16.42, 18.25, 22.52, 23.36, 24.32, 25.18]:
    add(sfx, c, click(), 0.3, pan=0.15)
    add(wet, c, click(), 0.05)
for i in range(53):
    add(sfx, 10.62 + i * (1.68 / 53) + rng.uniform(-0.006, 0.006), tick(), 0.12 * rng.uniform(0.6, 1.0), pan=rng.uniform(-0.2, 0.2))
# generating checklist pops
for at, m in zip([20.05, 20.35, 20.65, 20.95, 21.2], [69, 72, 74, 76, 79]):
    add(sfx, at, pop(midi(m + 12)), 0.12, pan=0.1)
    add(wet, at, pop(midi(m + 12)), 0.08)
# exported + live chimes
for i, m in enumerate([84, 88, 91]):
    add(sfx, 22.95 + i * 0.05, bell(midi(m), 1.2), 0.05)
    add(wet, 22.95 + i * 0.05, bell(midi(m), 1.2), 0.05)
for i, m in enumerate([79, 84, 88, 91]):
    add(sfx, 25.42 + i * 0.06, bell(midi(m)), 0.08, pan=(i - 1.5) * 0.3)
    add(wet, 25.42 + i * 0.06, bell(midi(m)), 0.08)
# outro
add(sfx, BACK_IN, boom(), 0.5)
add(wet, BACK_IN, boom(), 0.12)
for at in [28.05, 29.22]:
    add(sfx, at - 0.12, whoosh(0.12, 0.35, 600, 10000), 0.1)
add(sfx, 30.0, riser(0.92) * 0.6, 0.22)
add(sfx, 30.92, impact(60, 34, 1.2), 0.5)
for i, m in enumerate([76, 81, 84, 88]):
    add(wet, 30.95 + i * 0.07, bell(midi(m), 2.4), 0.07)

# ------------------------------------------------------------------ bus processing
# music level automation: soft intro, full groove, silence gap, outro, fade
t_all = np.arange(N) / SR
g = np.interp(t_all, [0, 1.6, 3.9, 4.45, DROP_OUT - 0.05, DROP_OUT + 0.1, BACK_IN - 0.02, BACK_IN, END_FADE[0], END_FADE[1], DUR],
              [0.0, 0.45, 0.6, 1.0, 1.0, 0.03, 0.03, 1.0, 1.0, 0.0, 0.0])
music *= g[:, None]
drums *= np.interp(t_all, [0, DROP_OUT - 0.04, DROP_OUT + 0.02, DUR], [1, 1, 0, 0])[:, None]


def reverb(x, secs=1.8):
    n = int(secs * SR)
    tt = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)) * np.exp(-tt / (secs / 6.5))[:, None]
    ir[: int(0.012 * SR)] = 0
    out = np.zeros_like(x)
    L = 1 << int(np.ceil(np.log2(len(x) + n)))
    for ch in range(2):
        out[:, ch] = np.fft.irfft(np.fft.rfft(x[:, ch], L) * np.fft.rfft(ir[:, ch], L), L)[: len(x)]
    return out / (np.abs(out).max() + 1e-9)


wet_g = np.interp(t_all, [0, END_FADE[1] - 0.6, DUR], [1, 1, 0.2])[:, None]
mix = music + drums + sfx + reverb(wet) * 0.18 * wet_g
mix *= np.interp(t_all, [0, DUR - 0.25, DUR], [1, 1, 0])[:, None]
mix = mix / (np.abs(mix).max() + 1e-9) * 1.05
mix = np.tanh(1.25 * mix) / np.tanh(1.25) * 0.89

out = sys.argv[1] if len(sys.argv) > 1 else "soundtrack.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", out, f"{DUR}s")
