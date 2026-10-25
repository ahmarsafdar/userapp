"""Sound effects for the HBL Prestige film, laid under the music from music.py.
All of it is synthesized here, so each effect sits on its frame and the tuned ones are in the song's key (D):
  0:00    dark air under the stone; a reverse swell into a low boom as the key light comes on, and a glow as it rises
  0:04.3  the riser's reverb rings on past the cut; the two drops of liquid metal well up, viscous and close
  0:06.1  they splash down, spread with a sizzle, meet with a gloop and set into the card with a tick
  0:07.0  a satin swish; 0:08.0 the six chip pads seat one by one; 0:08.9 the chip drops into the soft surface
  0:09.9  shimmer as the light crosses the copper wordmark; 0:10.8 a glint slides off the Mastercard corner
  0:11.7  the pair fans open; 0:13.6 the cards pass; a reverse swell into the face, and air as its light sweeps across
  0:17    air as the card floats in; the glint crosses its face; the logo lands on a struck-metal ring
The mix is then set to -14 LUFS, like the other films on the site, with its true peaks held under -2.3 dBTP.
Reads music.wav and writes sfx.wav and mix.wav (48 kHz stereo float) in the folder given as the first argument."""
import os
import sys

import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d

SR = 48000
DUR = 23.5
N = int(round(SR * DUR))
LUFS, CEILING = -14.0, -2.3  # the ceiling leaves room for the AAC encode, which pushes peaks up by up to 1 dB
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
_seed = iter(range(1000, 100000))

# The song sits on D with its mode left open, so the tuned effects use only D and A.
D1 = 36.708
D2, A2, D3, A3, D4, A4, D5, A5, D6, A6, D7, A7, D8 = (D1 * 2 ** (s / 12) for s in (12, 19, 24, 31, 36, 43, 48, 55, 60, 67, 72, 79, 84))


# ---------------------------------------------------------------- building blocks

def secs(d):
    return np.arange(int(round(d * SR))) / SR


def rng():
    return np.random.default_rng(next(_seed))


def noise(d):
    return rng().standard_normal(int(round(d * SR)))


def band(x, lo=None, hi=None, order=4):
    if lo and hi:
        sos = signal.butter(order, [lo, hi], 'band', fs=SR, output='sos')
    elif lo:
        sos = signal.butter(order, lo, 'high', fs=SR, output='sos')
    else:
        sos = signal.butter(order, hi, 'low', fs=SR, output='sos')
    return signal.sosfilt(sos, x, axis=0)


def edges(x, a=0.003, b=0.02):
    """Raised-cosine fade in and out, so nothing starts or stops with a click."""
    n = len(x)
    w = np.ones(n)
    ia, ib = min(n, int(a * SR)), min(n, int(b * SR))
    if ia:
        w[:ia] = 0.5 - 0.5 * np.cos(np.pi * np.arange(ia) / ia)
    if ib:
        w[n - ib:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(1, ib + 1) / ib)
    return x * (w[:, None] if x.ndim == 2 else w)


def peak(x):
    return x / (np.abs(x).max() + 1e-12)


def bell(d, at, rise, fall):
    """An envelope that swells to 1 at `at` seconds and dies away: smooth rise, exponential-ish fall."""
    t = secs(d)
    up = np.clip(1 - (at - t) / rise, 0, 1)
    down = np.clip(1 - (t - at) / fall, 0, 1)
    return np.where(t < at, up ** 2 * (3 - 2 * up), down ** 2)


def sweep(x, centre, width):
    """Band-passes x through a band that moves: centre (Hz) and width (octaves) are breakpoints spread over x."""
    f, tt, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
    c = np.interp(tt, np.linspace(0, len(x) / SR, len(centre)), np.log2(centre))
    w = np.interp(tt, np.linspace(0, len(x) / SR, len(width)), width)
    lf = np.log2(np.maximum(f, 20))[:, None]
    _, y = signal.istft(Z * np.exp(-0.5 * ((lf - c) / w) ** 2), SR, nperseg=1024, noverlap=768)
    return y[:len(x)]


def pan(x, p):
    """Equal-power pan of mono x: p runs -1 (left) to 1 (right), a number or an array along x."""
    a = (np.asarray(p, dtype=float) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1) * np.sqrt(2)


def glide(p0, p1, d):
    return np.linspace(p0, p1, int(round(d * SR)))


def tone(f, t):
    """A sine whose frequency f may change over time t."""
    f = np.broadcast_to(f, t.shape)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def room(rt60, predelay, seed):
    """Stereo impulse response: decaying noise that loses its highs first, decorrelated left and right."""
    t = secs(rt60 * 1.1)
    r = np.random.default_rng(seed)
    ir = np.zeros((len(t), 2))
    for ch in range(2):
        x = r.standard_normal(len(t))
        for lo, hi, k in ((None, 350, 1.2), (350, 2500, 1.0), (2500, 7000, 0.65), (7000, None, 0.4)):
            ir[:, ch] += band(x, lo, hi, 2) * 10 ** (-3 * t / (rt60 * k))
    ir *= (1 - np.exp(-t / 0.025))[:, None]
    ir = np.vstack([np.zeros((int(predelay * SR), 2)), ir])
    return ir / np.sqrt((ir ** 2).sum(axis=0))


HALL, PLATE = room(2.8, 0.03, 5), room(0.9, 0.012, 6)


def reverb(x, ir):
    x = x if x.ndim == 2 else np.stack([x, x], 1)
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c]) for c in range(2)], 1)


# ---------------------------------------------------------------- sounds

def boom(d=2.4, f0=82.0, f1=D1, glide_s=0.18, decay=0.9, drive=2.0):
    """A sub drop: a sine that falls to f1, saturated so it still reads on small speakers, with a soft thump."""
    t = secs(d)
    x = tone(f1 + (f0 - f1) * np.exp(-t / glide_s), t) * (1 - np.exp(-t / 0.004)) * np.exp(-t / decay)
    x = np.tanh(drive * x) / np.tanh(drive)
    x += 0.35 * peak(band(noise(d), None, 240)) * np.exp(-t / 0.09)
    return edges(x, 0.001, 0.3)


def reverse_swell(d, lo=500, hi=9000):
    """A reversed reverb tail that swells up to its end: placed so it ends on the hit it leads into."""
    burst = band(noise(0.05), lo, hi) * np.hanning(int(0.05 * SR))
    wet = reverb(burst, HALL)[int(0.03 * SR):][:int(d * SR)][::-1]  # past the pre-delay, so it swells right up to the hit
    wet *= (np.linspace(0, 1, len(wet)) ** 1.5)[:, None]
    return edges(peak(wet), 0.05, 0.004)


def bubble(f0, rise, tau, d=None):
    """One bubble or gloop: a sine that rises in pitch as it dies away (Minnaert resonance)."""
    d = d or tau * 7
    t = secs(d)
    f = f0 * (1 + rise * (1 - np.exp(-t / (tau * 0.8))))
    return edges(tone(f, t) * (1 - np.exp(-t / 0.0015)) * np.exp(-t / tau), 0.0005, 0.01)


def welling(d, f_lo, f_hi, count):
    """Liquid metal welling up: heavy low gloops over a slow viscous mass, thickest as it rises."""
    r = rng()
    t = secs(d)
    x = np.zeros(len(t))
    times = np.sort(d * 0.8 * r.beta(1.6, 2.4, count))
    for i, at in enumerate(times):
        f0 = r.uniform(f_lo, f_hi) * (1 + 0.25 * i / count)
        b = bubble(f0, r.uniform(0.25, 0.6), r.uniform(0.035, 0.07)) * r.uniform(0.5, 1.0)
        j = int(at * SR)
        n = min(len(b), len(x) - j)
        x[j:j + n] += b[:n]
    mass = band(noise(d), 40, 260) * bell(d, d * 0.45, d * 0.4, d * 0.55)
    wobble = tone(np.linspace(85, 125, len(t)), t) * (0.6 + 0.4 * np.sin(2 * np.pi * 7.5 * t)) * bell(d, d * 0.5, d * 0.45, d * 0.5)
    return edges(peak(x) + 0.35 * peak(mass) + 0.18 * wobble, 0.02, 0.15)


def splat(size=1.0):
    """Liquid metal hitting the floor: a slap, a burst of bubbles, flung droplets and a little weight underneath."""
    r = rng()
    d = 0.9
    t = secs(d)
    x = 0.8 * peak(band(noise(d), 1500, 9000)) * np.exp(-t / 0.004)
    x += peak(band(noise(d), 150, 2000)) * np.exp(-t / 0.03 / size)
    for _ in range(int(12 * size)):
        at = r.uniform(0.0, 0.18)
        b = bubble(r.uniform(300, 1400) / size, r.uniform(0.3, 0.8), r.uniform(0.012, 0.035)) * r.uniform(0.2, 0.6)
        j = int(at * SR)
        x[j:j + len(b)] += b[:len(x) - j]
    for _ in range(10):
        at = r.uniform(0.08, 0.6)
        b = bubble(r.uniform(1800, 4200), r.uniform(0.2, 0.5), r.uniform(0.004, 0.01)) * r.uniform(0.05, 0.2)
        j = int(at * SR)
        x[j:j + len(b)] += b[:len(x) - j]
    weight = boom(0.5, 120, D2, 0.03, 0.12, 1.5)
    x[:len(weight)] += 0.5 * weight
    return edges(peak(x), 0.0005, 0.1)


def sizzle(d, density=180):
    """A spreading film of liquid: a fine crackle of tiny bright bursts that thins out."""
    r = rng()
    out = np.zeros((int(d * SR), 2))
    for _ in range(int(density * d)):
        at = d * r.beta(1.0, 2.2)
        n = int(r.uniform(0.002, 0.006) * SR)
        g = band(r.standard_normal(n + 64), 3000, 11000)[64:] * np.hanning(n)
        j = int(at * SR)
        out[j:j + n] += pan(g, r.uniform(-0.7, 0.7))[:len(out) - j] * r.uniform(0.3, 1.0)
    return edges(out / (np.abs(out).max() + 1e-12), 0.002, 0.05)


def modal(f0, ratios, amps, taus, d, strike=0.6):
    """A struck metal object: inharmonic partials, each with its own decay, and a short strike transient."""
    t = secs(d)
    r = rng()
    x = sum(a * np.sin(2 * np.pi * f0 * k * t + r.uniform(0, 6.28)) * np.exp(-t / tau) for k, a, tau in zip(ratios, amps, taus))
    x = x * (1 - np.exp(-t / 0.0004))
    x = peak(x) + strike * peak(band(noise(d), 2000, 12000)) * np.exp(-t / 0.0015)
    return edges(peak(x), 0.0002, 0.02)


def click(f0, pitch_jitter=0.03):
    """A chip pad seating: a bright small-plate click with a short body thock under it."""
    r = rng()
    f = f0 * (1 + r.uniform(-pitch_jitter, pitch_jitter))
    x = modal(f, (1, 1.59, 2.14, 2.65, 3.42), (1, 0.6, 0.45, 0.3, 0.2), (0.05, 0.035, 0.025, 0.018, 0.012), 0.25, 0.9)
    t = secs(0.25)
    thock = 0.7 * np.sin(2 * np.pi * 640 * t) * np.exp(-t / 0.008) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.02)
    return edges(peak(x + thock), 0.0002, 0.02)


def ring(f0, d, bright=1.0):
    """A struck copper plate in tune with the song: D and A partials, a few inharmonic ones, a slow beat."""
    ratios = (1, 1.5, 2, 3, 4, 2.76, 4.07, 5.40)
    amps = (1, 0.5, 0.7, 0.35, 0.25 * bright, 0.12 * bright, 0.08 * bright, 0.06 * bright)
    taus = (d * 0.45, d * 0.35, d * 0.3, d * 0.2, d * 0.14, d * 0.1, d * 0.07, d * 0.05)
    x = modal(f0, ratios, amps, taus, d, 0.3)
    t = secs(d)
    x += 0.25 * np.sin(2 * np.pi * (f0 * 2 + 0.7) * t) * np.exp(-t / (d * 0.3))  # beats against the octave
    return edges(peak(x), 0.0002, 0.3)


def sparkle(d, at, rise, fall, density, notes=(D7, A7, D8, A6, D6)):
    """Glitter: tiny tuned grains whose density follows a swell, scattered across the stereo field."""
    r = rng()
    e = bell(d, at, rise, fall)
    out = np.zeros((len(e), 2))
    p = e / e.sum()
    for j in r.choice(len(e), int(density * d), p=p):
        n = int(r.uniform(0.004, 0.014) * SR)
        f = r.choice(notes) * r.choice((1, 1, 2)) * (1 + r.uniform(-0.002, 0.002))
        g = np.sin(2 * np.pi * f * np.arange(n) / SR) * np.hanning(n) * r.uniform(0.3, 1.0)
        out[j:j + n] += pan(g, r.uniform(-0.8, 0.8))[:len(out) - j]
    return out / (np.abs(out).max() + 1e-12)


def air(d, at, rise, fall, lo, mid, hi, width=0.9):
    """A whoosh: noise through a band that climbs to `mid` Hz at the peak and falls back, shaped by a swell."""
    x = sweep(noise(d), (lo, mid, hi), (width, width * 0.8, width))
    return peak(x * bell(d, at, rise, fall))


def shimmer(d, at, rise, fall, p0, p1, density=220):
    """Light crossing polished metal: bright air and glitter that travel with it from p0 to p1."""
    a = pan(air(d, at, rise, fall, 3500, 8500, 5000, 0.7), glide(p0, p1, d))
    return 0.7 * a + 0.5 * sparkle(d, at, rise, fall, density)


def swish(d, at, rise, fall, p0, p1):
    """Satin moving: a soft band of noise with the grain of cloth in it."""
    x = air(d, at, rise, fall, 1100, 3800, 1700, 1.0)
    grain = peak(band(noise(d), 18, 70))
    return pan(peak(x * (1 + 0.7 * grain)), glide(p0, p1, d))


def thud():
    """The chip landing in the soft surface: a cushioned low thump with a squelch as the surface gives."""
    t = secs(0.8)
    x = tone(44 + 38 * np.exp(-t / 0.035), t) * (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.17)
    x += 0.45 * peak(band(noise(0.8), None, 450)) * np.exp(-t / 0.045)
    sq = sweep(noise(0.8), (900, 420, 220), (0.25, 0.25, 0.3)) * np.exp(-t / 0.07)
    return edges(peak(x) + 0.35 * peak(sq), 0.0005, 0.2)


def stretch(d):
    """The surface stretching round the chip: a low rubbery creak."""
    t = secs(d)
    x = sweep(noise(d), (210, 150, 120), (0.15, 0.12, 0.12)) * (0.65 + 0.35 * np.sin(2 * np.pi * 13 * t))
    return peak(x * bell(d, d * 0.3, d * 0.3, d * 0.7))


# ---------------------------------------------------------------- the cues

music, sr = sf.read(os.path.join(OUT, 'music.wav'), dtype='float64')
assert sr == SR and len(music) == N, 'music.wav must come from music.py'

dry = np.zeros((N, 2))
send = {'hall': np.zeros((N, 2)), 'plate': np.zeros((N, 2))}


def put(x, at, db, p=0.0, hall=0.0, plate=0.0):
    """Mixes x in at film time `at` (seconds), at `db` dB below full scale at its peak, with reverb sends."""
    x = pan(x, p) if x.ndim == 1 else x
    x = x * 10 ** (db / 20)
    i = int(round(at * SR))
    j0, i = max(0, -i), max(0, i)
    n = min(len(x) - j0, N - i)
    if n > 0:
        dry[i:i + n] += x[j0:j0 + n]
        send['hall'][i:i + n] += x[j0:j0 + n] * hall
        send['plate'][i:i + n] += x[j0:j0 + n] * plate


# 0:00 ROCK: dark air under the stone, a reverse swell into a low boom on the light, a glow as it rises
t = secs(4.35)
rumble = np.stack([band(noise(4.35), 28, 170) for _ in range(2)], 1) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.21 * t))[:, None]
hiss = np.stack([band(noise(4.35), 3500, 9000) for _ in range(2)], 1) * 0.06
bed = (rumble / np.abs(rumble).max() + hiss) * np.clip(t / 1.4, 0, 1)[:, None] * np.clip((4.33 - t) / 0.12, 0, 1)[:, None]
put(bed, 0.0, -24)
put(reverse_swell(1.1), 2.33 - 1.1, -17)
put(boom(2.6, 84, D1, 0.2, 1.0, 2.2), 2.33, -12, hall=0.25)
g = secs(1.6)
glow = sum(a * (np.sin(2 * np.pi * f * g) + np.sin(2 * np.pi * f * 1.003 * g)) for f, a in ((D6, 1), (A6, 0.6), (D7, 0.4), (A7, 0.2)))
glow = edges(peak(glow * bell(1.6, 0.9, 0.85, 0.7)), 0.01, 0.1)
put(pan(glow, 0.15) + 0.6 * pan(air(1.6, 0.9, 0.85, 0.7, 4000, 9000, 6000, 0.6), 0.3), 2.4, -30, hall=0.6)

# 0:04.3 EMERGE: the riser's reverb rings on past the cut, then the two drops well up out of the rock
i0, i1 = int(4.0 * SR), int(4.3 * SR)
throw = music[i0:i1] * np.linspace(0, 1, i1 - i0)[:, None] ** 2
tail = reverb(throw, HALL)[:N - i0]
dry[i0:i0 + len(tail)] += tail * 10 ** (-16 / 20)
put(welling(1.15, 95, 210, 9), 4.4, -15, p=-0.25, plate=0.2)
put(welling(0.95, 120, 260, 8), 5.0, -16, p=0.3, plate=0.2)
put(reverse_swell(0.6, 300, 6000), 6.1 - 0.6, -20)

# 0:06.1 MOLTEN: two splashes, the spreading film, the two pools meeting, and the card shape setting
put(splat(1.0), 6.1, -9, p=-0.3, hall=0.12)
put(splat(0.7), 6.1375, -12, p=0.35, hall=0.12)
put(sizzle(0.5), 6.15, -24, plate=0.2)
put(bubble(205, 0.7, 0.085), 6.45, -11, plate=0.25)
put(bubble(150, 0.5, 0.11), 6.47, -17, plate=0.25)
put(modal(D7, (1, 2.76, 5.40), (1, 0.4, 0.2), (0.35, 0.15, 0.08), 1.0, 0.4), 6.92, -24, p=0.1, hall=0.4)

# 0:07.04 SILK: a satin swish
put(swish(0.95, 0.42, 0.35, 0.5, -0.4, 0.4), 7.04, -9, plate=0.2)

# 0:07.98 CONTACTS: six pads seat, 70 ms apart (src/shots/chip.js), then the chip locks
for k, p in enumerate((-0.35, 0.15, -0.1, 0.35, -0.2, 0.25)):
    put(click(3900 - 120 * k), 7.98 + 0.07 * k, -13, p=p, plate=0.3)
put(modal(D4, (1, 1.5, 2.76, 4.07), (1, 0.5, 0.3, 0.15), (0.09, 0.06, 0.04, 0.02), 0.5, 0.8), 8.40, -12, plate=0.35)

# 0:08.91 POCKET: the chip drops, lands in the soft surface, and the surface stretches round it
put(pan(air(0.25, 0.2, 0.18, 0.05, 2600, 1400, 700, 0.8), 0.0), 8.9125, -21)
put(thud(), 9.13, -13, plate=0.15)
put(stretch(0.45), 9.15, -24, plate=0.2)

# 0:09.85 LOGO: shimmer as the light crosses the copper wordmark, and the copper answering
put(shimmer(0.9, 0.47, 0.4, 0.4, -0.6, 0.6), 9.85, -14, hall=0.35)
put(ring(D5, 1.6, 0.6), 10.32, -18, hall=0.5)

# 0:10.79 MARK: a glint slides off the Mastercard corner, right to left
put(shimmer(0.55, 0.45, 0.3, 0.25, 0.5, -0.5, 160), 10.79, -11, hall=0.35)

# 0:11.73 PAIR: the two cards flick and fan open, then air as the camera pushes in
put(modal(5200, (1, 1.7, 2.9), (1, 0.5, 0.3), (0.012, 0.008, 0.005), 0.08, 1.0), 11.735, -15, p=-0.2, plate=0.2)
put(modal(4700, (1, 1.7, 2.9), (1, 0.5, 0.3), (0.012, 0.008, 0.005), 0.08, 1.0), 11.79, -16, p=0.25, plate=0.2)
put(pan(air(0.45, 0.12, 0.1, 0.33, 800, 3200, 1200, 0.9), glide(-0.4, 0.1, 0.45)), 11.725, -17, plate=0.15)
put(pan(air(0.5, 0.14, 0.12, 0.36, 700, 2800, 1000, 0.9), glide(0.4, -0.1, 0.5)), 11.76, -18, plate=0.15)
put(pan(air(1.6, 0.9, 0.9, 0.7, 500, 1500, 800, 1.1), 0.0), 12.0, -27, hall=0.3)

# 0:13.6 CROSS: the cards pass each other, light running along their edges; a reverse swell into the face
put(pan(air(1.15, 0.5, 0.45, 0.6, 450, 2400, 800, 1.1), glide(-0.6, 0.6, 1.15)), 13.6, -8, hall=0.2)
put(sparkle(1.0, 0.5, 0.4, 0.45, 120), 13.65, -20, hall=0.4)
put(reverse_swell(0.55), 15.006 - 0.55, -13)

# 0:15.0 FACE: a soft low hit on the cut, then air and glitter as the soft box sweeps the lacquer left to right
put(boom(1.2, 70, D2, 0.08, 0.35, 1.6), 15.006, -13, hall=0.3)
put(shimmer(1.8, 0.9, 0.75, 0.85, -0.7, 0.7, 260), 15.06, -12, hall=0.4)

# 0:17 HERO: air as the card floats in, the glint crossing its face (0:18.85-0:19.85), a swell into the logo
put(pan(air(1.4, 0.55, 0.5, 0.85, 350, 1100, 600, 1.1), glide(-0.2, 0.2, 1.4)), 17.0, -23, hall=0.35)
put(shimmer(1.15, 0.38, 0.35, 0.75, -0.6, 0.6, 240), 18.82, -19, hall=0.45)
put(modal(A6, (1, 2.0, 2.76), (1, 0.35, 0.15), (0.6, 0.35, 0.12), 1.6, 0.3), 19.2, -24, p=0.05, hall=0.5)
put(reverse_swell(0.7), 20.633 - 0.7, -11)

# 0:20.6 END: the logo lands on a struck copper ring with weight under it; air as the light crosses it at 0:21.9
put(ring(D3, 2.9), 20.633, -10, hall=0.45)
put(boom(1.8, 66, D1, 0.12, 0.8, 1.8), 20.633, -13, hall=0.2)
put(shimmer(1.4, 0.7, 0.6, 0.65, -0.5, 0.5, 180), 21.2, -26, hall=0.45)

wet = dry.copy()
for name, ir in (('hall', HALL), ('plate', PLATE)):
    wet += reverb(send[name], ir)[:N]
sfx = wet * np.clip((DUR - secs(DUR)) / 0.4, 0, 1)[:, None]  # tails fade out with the film



# ---------------------------------------------------------------- master

def loudness(x):
    """Integrated loudness in LUFS (ITU-R BS.1770-4: K-weighted, 400 ms blocks, absolute and relative gates)."""
    y = signal.lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x, axis=0)
    y = signal.lfilter([1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621], y, axis=0)
    step, size = int(0.1 * SR), int(0.4 * SR)
    z = np.array([(y[i:i + size] ** 2).mean(axis=0).sum() for i in range(0, len(y) - size + 1, step)])
    z = z[-0.691 + 10 * np.log10(z + 1e-20) > -70]
    z = z[-0.691 + 10 * np.log10(z) > -0.691 + 10 * np.log10(z.mean()) - 10]
    return -0.691 + 10 * np.log10(z.mean())


def true_peaks(x):
    """The highest level each sample reaches between itself and the next, from a 4x oversampled copy."""
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(axis=1)
    return up[:len(x) * 4].reshape(len(x), 4).max(axis=1)


def limit(x, ceiling_db, look=0.003, release=0.08):
    """A lookahead true-peak limiter: the gain dips smoothly just ahead of each overshoot and recovers over `release`."""
    g = np.minimum(1, 10 ** (ceiling_db / 20) / np.maximum(true_peaks(x), 1e-9))
    n = int(look * SR)
    g = np.convolve(minimum_filter1d(g, 2 * n + 1), np.ones(n) / n, mode='same')
    a = np.exp(-1 / (release * SR))
    out, cur = np.empty_like(g), 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else a * cur + (1 - a) * v
        out[i] = cur
    return x * out[:, None]


mix = music + sfx
mix *= 10 ** ((LUFS - loudness(mix)) / 20)
mix = limit(mix, CEILING)
tp = 20 * np.log10(true_peaks(mix).max())
sf.write(os.path.join(OUT, 'sfx.wav'), sfx.astype(np.float32), SR, subtype='FLOAT')
sf.write(os.path.join(OUT, 'mix.wav'), mix.astype(np.float32), SR, subtype='FLOAT')
print(f'ok {DUR}: mix {loudness(mix):.1f} LUFS, true peak {tp:.1f} dBTP')
