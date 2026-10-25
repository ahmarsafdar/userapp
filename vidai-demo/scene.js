// Vid.AI product film. Everything is a pure function of time: renderAt(t) poses
// every layer for second t, so render.mjs can step through frames deterministically.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1920, H = 1080;
const DURATION = 33.5;

// ---------------------------------------------------------------- math
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, u) => a + (b - a) * u;
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  lin: u => u,
  inC: u => u * u * u,
  outC: u => 1 - Math.pow(1 - u, 3),
  ioC: u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  inE: u => (u === 0 ? 0 : Math.pow(2, 10 * u - 10)),
  outE: u => (u === 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  ioE: u => (u === 0 ? 0 : u === 1 ? 1 : u < 0.5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2),
  outB: u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); },
  ioS: u => -(Math.cos(Math.PI * u) - 1) / 2,
};
const tw = (t, a, b, v0, v1, e = E.outE) => lerp(v0, v1, e(P(t, a, b)));
const bump = u => (u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u));
// keys: [[t, v], [t, v, ease], ...]; the ease belongs to the segment that ends at that key
function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1], [t1, v1, e] = keys[i];
      return lerp(v0, v1, (e || E.ioC)(P(t, t0, t1)));
    }
  }
  return keys[keys.length - 1][1];
}
const $ = s => document.querySelector(s);

// ---------------------------------------------------------------- assets
const IMG = {};
const IMG_NAMES = ['cinematic', 'natural', 'neon-art', 'isometric', 'anime', 'comic-art'];
function loadImages() {
  return Promise.all(IMG_NAMES.map(n => new Promise(res => {
    const im = new Image();
    im.onload = () => { IMG[n] = im; res(); };
    im.onerror = () => res();
    im.src = `assets/style-${n}.jpg`;
  })));
}
const LOGO = {
  V: 'M6.48396 0.110352C6.84885 0.110352 7.1699 0.353668 7.27181 0.707449L11.9037 16.7874C11.919 16.8403 11.9669 16.8766 12.0214 16.8766C12.0759 16.8766 12.1239 16.8403 12.1391 16.7874L16.771 0.707448C16.8729 0.353668 17.194 0.110352 17.5589 0.110352H23.0296C23.5886 0.110352 23.984 0.662495 23.8087 1.19851L16.577 23.3208C16.466 23.6603 16.1519 23.8896 15.7979 23.8896H8.24498C7.89092 23.8896 7.57681 23.6603 7.46583 23.3208L0.234106 1.19851C0.0588838 0.662495 0.45423 0.110352 1.01325 0.110352H6.48396Z',
  I: 'M32.6031 0.110352C33.0563 0.110352 33.4236 0.481274 33.4236 0.93883V23.0612C33.4236 23.5187 33.0563 23.8896 32.6031 23.8896H27.8506C27.3975 23.8896 27.0301 23.5187 27.0301 23.0612V0.93883C27.0301 0.481274 27.3975 0.110352 27.8506 0.110352H32.6031Z',
  P: 'M36.603 22.8067C36.603 23.4511 37.2996 23.8488 37.8464 23.5166L55.6388 12.7099C56.1689 12.388 56.1689 11.612 55.6388 11.2901L37.8464 0.483378C37.2996 0.151226 36.603 0.548929 36.603 1.19332V22.8067Z',
};

// ---------------------------------------------------------------- canvas helpers
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCover(ctx, img, w, h, zoom, fx, fy = 0.5) {
  if (!img) { ctx.fillStyle = '#223'; ctx.fillRect(0, 0, w, h); return; }
  const iw = img.width, ih = img.height;
  let sh = ih / zoom, sw = sh * (w / h);
  if (sw > iw) { sw = iw; sh = sw * (h / w); }
  const sx = clamp(fx * iw - sw / 2, 0, iw - sw), sy = clamp(fy * ih - sh / 2, 0, ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

// The generated Short that plays on the phone and in the preview.
const SHORT_SCENES = [['cinematic', 0.44, 0.55], ['natural', 0.42, 0.55], ['neon-art', 0.39, 0.6], ['isometric', 0.42, 0.6]];
const CAPS = [['HE WALKED', 0], ['FORTY DAYS', 0.7], ['TO SEE', 1.4], ['THIS VIEW.', 2.0], ['NO MAP.', 2.75], ['NO SIGNAL.', 3.35], ['JUST HIM', 4.0], ['AND THE SKY.', 4.6]];
const CAP_LOOP = 5.3;
function drawShort(ctx, w, h, vt, phone = false) {
  const per = 2.65, n = SHORT_SCENES.length;
  const k = Math.floor(vt / per), idx = ((k % n) + n) % n, nx = (idx + 1) % n, local = (vt - k * per) / per;
  const sc = SHORT_SCENES[idx];
  drawCover(ctx, IMG[sc[0]], w, h, 1.12 + 0.14 * local, sc[1] + 0.03 * (local - 0.5), sc[2]);
  if (local > 0.86) {
    const s2 = SHORT_SCENES[nx];
    ctx.globalAlpha = (local - 0.86) / 0.14;
    drawCover(ctx, IMG[s2[0]], w, h, 1.12, s2[1] - 0.015, s2[2]);
    ctx.globalAlpha = 1;
  }
  let g = ctx.createLinearGradient(0, h * 0.42, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  g = ctx.createLinearGradient(0, 0, 0, h * 0.18);
  g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h * 0.18);

  // captions: one chunk at a time, active word on a blue chip
  const ct = ((vt % CAP_LOOP) + CAP_LOOP) % CAP_LOOP;
  let ci = 0; for (let i = 0; i < CAPS.length; i++) if (CAPS[i][1] <= ct) ci = i;
  const start = CAPS[ci][1], end = ci + 1 < CAPS.length ? CAPS[ci + 1][1] : CAP_LOOP;
  const words = CAPS[ci][0].split(' ');
  const active = Math.min(words.length - 1, Math.floor((ct - start) / ((end - start) / words.length)));
  const fs = w * 0.112;
  const pop = 1 + 0.16 * (1 - E.outE(clamp((ct - start) / 0.2)));
  ctx.save();
  ctx.translate(w / 2, h * 0.6);
  ctx.scale(pop, pop);
  ctx.font = `800 ${fs}px Inter`;
  ctx.textBaseline = 'middle';
  const gap = fs * 0.28;
  const ws = words.map(x => ctx.measureText(x).width);
  let x = -(ws.reduce((a, b) => a + b, 0) + gap * (words.length - 1)) / 2;
  words.forEach((wd, i) => {
    if (i === active) {
      ctx.fillStyle = '#2563EB';
      rr(ctx, x - fs * 0.16, -fs * 0.62, ws[i] + fs * 0.32, fs * 1.2, fs * 0.22);
      ctx.fill();
    }
    ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    if (i !== active) ctx.strokeText(wd, x, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(wd, x, 0);
    x += ws[i] + gap;
  });
  ctx.restore();

  // right rail
  const rx = w * 0.885, s = w / 620;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = `600 ${22 * s}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const railY = h * 0.66;
  // heart
  ctx.save(); ctx.translate(rx, railY); ctx.scale(s * 1.5, s * 1.5);
  ctx.beginPath(); ctx.moveTo(0, 10); ctx.bezierCurveTo(-22, -6, -12, -22, 0, -12); ctx.bezierCurveTo(12, -22, 22, -6, 0, 10); ctx.fill();
  ctx.restore();
  ctx.fillText('24.1K', rx, railY + 46 * s);
  // comment
  ctx.beginPath(); ctx.ellipse(rx, railY + 100 * s, 20 * s, 17 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(rx - 12 * s, railY + 110 * s); ctx.lineTo(rx - 20 * s, railY + 124 * s); ctx.lineTo(rx - 2 * s, railY + 114 * s); ctx.fill();
  ctx.fillText('812', rx, railY + 150 * s);
  // share
  ctx.beginPath(); ctx.moveTo(rx + 20 * s, railY + 196 * s); ctx.lineTo(rx - 4 * s, railY + 178 * s); ctx.lineTo(rx - 4 * s, railY + 188 * s);
  ctx.quadraticCurveTo(rx - 22 * s, railY + 190 * s, rx - 22 * s, railY + 214 * s); ctx.quadraticCurveTo(rx - 14 * s, railY + 202 * s, rx - 4 * s, railY + 204 * s);
  ctx.lineTo(rx - 4 * s, railY + 214 * s); ctx.closePath(); ctx.fill();
  ctx.fillText('Share', rx, railY + 244 * s);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#fff';
  ctx.font = `700 ${27 * s}px Inter`;
  ctx.fillText('@summitstories', 34 * s, h - 118 * s);
  ctx.font = `400 ${22 * s}px Inter`;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText('He walked forty days to see this…', 34 * s, h - 82 * s);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(0, h - 10 * s, w, 4 * s);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, h - 10 * s, w * ((vt % 58) / 58 * 0.6 + 0.08), 4 * s);

  if (phone) {
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${30 * s}px Inter`;
    ctx.fillText('9:41', 74 * s, 66 * s);
    ctx.fillRect(w - 130 * s, 46 * s, 46 * s, 22 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(w - 82 * s, 52 * s, 4 * s, 10 * s);
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) ctx.fillRect(w - 196 * s + i * 11 * s, (64 - 6 - i * 4) * s, 7 * s, (6 + i * 4) * s);
    ctx.fillStyle = '#000';
    rr(ctx, w / 2 - 92 * s, 24 * s, 184 * s, 52 * s, 26 * s); ctx.fill();
  }
}

function drawLogoCtx(ctx, x, y, hgt, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(hgt / 24, hgt / 24); ctx.fillStyle = color;
  for (const k of ['V', 'I', 'P']) ctx.fill(new Path2D(LOGO[k]));
  ctx.restore();
}

// Laptop screen: the web app with the creation card in the middle.
function drawLaptopScreen(ctx, w, h, t) {
  ctx.fillStyle = '#EEF2F9'; ctx.fillRect(0, 0, w, h);
  let g = ctx.createRadialGradient(w * 0.15, h * 0.2, 0, w * 0.15, h * 0.2, w * 0.5);
  g.addColorStop(0, 'rgba(147,197,253,0.55)'); g.addColorStop(1, 'rgba(147,197,253,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  g = ctx.createRadialGradient(w * 0.9, h * 0.85, 0, w * 0.9, h * 0.85, w * 0.45);
  g.addColorStop(0, 'rgba(96,165,250,0.45)'); g.addColorStop(1, 'rgba(96,165,250,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // nav
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(0, 0, w, 72);
  ctx.fillStyle = '#E3E8F1'; ctx.fillRect(0, 72, w, 1.5);
  drawLogoCtx(ctx, 44, 24, 24, '#2563EB');
  ctx.fillStyle = '#0B1020'; ctx.font = '700 22px Inter'; ctx.textBaseline = 'middle';
  ctx.fillText('Vid.AI', 112, 37);
  ctx.font = '500 18px Inter'; ctx.fillStyle = '#5B6274';
  ['Home', 'Pricing', 'Avatars', 'MCP', 'Changelog'].forEach((s, i) => ctx.fillText(s, 560 + i * 110, 37));
  ctx.fillStyle = '#2563EB'; rr(ctx, w - 196, 18, 156, 38, 19); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '600 17px Inter'; ctx.textAlign = 'center'; ctx.fillText('Get Started', w - 118, 37);
  // headline
  ctx.fillStyle = '#0B1020'; ctx.font = '700 50px Inter'; ctx.fillText('Type an idea. Get a video.', w / 2, 140);
  ctx.fillStyle = '#5B6274'; ctx.font = '400 21px Inter'; ctx.fillText('Script, voiceover, visuals, music and captions, ready to post.', w / 2, 188);
  ctx.textAlign = 'left';

  // the card (a 0.62x copy of the glass slab layout)
  const S = 0.62, cw = 820 * S, ch = 1080 * S, cx = (w - cw) / 2, cy = 232;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(S, S);
  ctx.shadowColor = 'rgba(30,50,110,0.25)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
  g = ctx.createLinearGradient(0, 0, 820, 1080);
  g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, '#C9D3E6'); g.addColorStop(1, '#B9C9E8');
  ctx.fillStyle = g; rr(ctx, 0, 0, 820, 1080, 40); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#93C5FD'; ctx.lineWidth = 3; rr(ctx, 1.5, 1.5, 817, 1077, 39); ctx.stroke();
  // steps
  ctx.font = '600 17px Inter'; ctx.textBaseline = 'middle';
  [['1', 'Describe it', 26], ['2', 'Voice & style', 236], ['3', 'Generate & post', 470]].forEach(([n, s, x]) => {
    const tw2 = ctx.measureText(s).width + 62;
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; rr(ctx, x, 26, tw2, 44, 22); ctx.fill();
    ctx.fillStyle = '#3B82F6'; ctx.beginPath(); ctx.arc(x + 22, 48, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(n, x + 22, 49); ctx.textAlign = 'left';
    ctx.fillStyle = '#0B1020'; ctx.fillText(s, x + 46, 49);
  });
  // tabs
  ctx.fillStyle = '#fff'; rr(ctx, 26, 90, 256, 70, 20); ctx.fill();
  ctx.font = '600 22px Inter'; ctx.textAlign = 'center';
  ctx.fillStyle = '#0B1020'; ctx.fillText('Faceless video', 154, 126);
  ctx.fillStyle = '#fff'; ctx.fillText('Short', 410, 126); ctx.fillText('With an avatar', 666, 126);
  // inner card
  ctx.fillStyle = '#fff'; rr(ctx, 26, 178, 768, 876, 28); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7A8195'; ctx.font = '600 15px Inter'; ctx.fillText('YOUR IDEA', 58, 222);
  ctx.fillStyle = '#F5F7FB'; rr(ctx, 58, 244, 704, 150, 18); ctx.fill();
  ctx.strokeStyle = '#E6E9F0'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#A3A9B8'; ctx.font = '400 26px Inter'; ctx.fillText('Describe the video you want to make', 80, 282);
  if (Math.floor(t * 2.4) % 2 === 0) { ctx.fillStyle = '#3B82F6'; ctx.fillRect(78, 266, 2.5, 30); }
  ctx.fillStyle = '#3F4659'; ctx.font = '600 19px Inter'; ctx.fillText('Narrator', 58, 470); ctx.fillText('Length', 58, 560);
  ctx.strokeStyle = '#E6E9F0'; rr(ctx, 330, 436, 432, 70, 18); ctx.stroke();
  ctx.fillStyle = '#3B82F6'; ctx.beginPath(); ctx.arc(368, 471, 25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0B1020'; ctx.font = '600 20px Inter'; ctx.fillText('Marcus', 408, 462);
  ctx.fillStyle = '#7A8195'; ctx.font = '400 15px Inter'; ctx.fillText('Deep · Documentary', 408, 486);
  ctx.fillStyle = '#F5F7FB'; rr(ctx, 410, 530, 352, 58, 16); ctx.fill();
  ctx.fillStyle = '#fff'; rr(ctx, 416, 536, 74, 46, 12); ctx.fill();
  ctx.fillStyle = '#2563EB'; ctx.font = '600 18px Inter'; ctx.fillText('30s', 436, 560);
  ctx.fillStyle = '#3F4659'; ctx.fillText('60s', 510, 560); ctx.fillText('3 min', 584, 560); ctx.fillText('10 min', 670, 560);
  ctx.fillStyle = '#7A8195'; ctx.font = '600 15px Inter'; ctx.fillText('IMAGE STYLE', 58, 630);
  ['cinematic', 'anime', 'comic-art', 'neon-art'].forEach((n, i) => {
    const x = 58 + i * 179, y = 652;
    ctx.save(); rr(ctx, x, y, 167, 140, 16); ctx.clip();
    if (IMG[n]) ctx.drawImage(IMG[n], 100, 0, 440, 360, x, y, 167, 140);
    ctx.restore();
  });
  ctx.fillStyle = '#E9ECF2'; rr(ctx, 58, 950, 704, 76, 20); ctx.fill();
  ctx.fillStyle = '#9AA1B2'; ctx.font = '700 25px Inter'; ctx.textAlign = 'center'; ctx.fillText('Generate', 410, 990);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ---------------------------------------------------------------- background
const bgc = $('#bg').getContext('2d');
function blob(x, y, r, rgb, a) {
  if (a <= 0.001) return;
  const g = bgc.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.5, `rgba(${rgb},${a * 0.45})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  bgc.fillStyle = g;
  bgc.fillRect(x - r, y - r, r * 2, r * 2);
}
function drawBG(t) {
  bgc.globalCompositeOperation = 'source-over';
  bgc.fillStyle = '#03050B';
  bgc.fillRect(0, 0, W, H);
  bgc.globalCompositeOperation = 'lighter';
  const I = track(t, [[0, 0.7], [3.3, 0.75], [4.4, 1.0], [9.7, 1.0], [10.3, 1.15], [26.3, 1.15], [27, 0.9]]);
  const out = tw(t, 26.3, 27.6, 0, 1, E.ioS);
  const a = t * 0.16;
  blob(1500 + 200 * Math.sin(a), 560 + 240 * Math.cos(a * 0.8), 680, '37,99,235', 0.34 * I * (1 - out));
  blob(240 + 160 * Math.cos(a * 0.7), 900 + 140 * Math.sin(a * 1.1), 560, '14,116,144', 0.22 * I * (1 - 0.6 * out));
  blob(860 + 320 * Math.sin(a * 0.5 + 2), 40 + 110 * Math.cos(a * 0.9), 480, '59,130,246', 0.15 * I);
  if (out > 0) {
    // outro: one big soft arc sweeping in from the top right, plus an ember low left
    const cx = 1900 + 120 * Math.sin(t * 0.3), cy = -380 + 60 * Math.cos(t * 0.25);
    const g = bgc.createRadialGradient(cx, cy, 980, cx, cy, 1460);
    g.addColorStop(0, 'rgba(59,130,246,0)');
    g.addColorStop(0.48, `rgba(59,130,246,${0.46 * out})`);
    g.addColorStop(1, 'rgba(59,130,246,0)');
    bgc.fillStyle = g; bgc.fillRect(0, 0, W, H);
    blob(120 + 80 * Math.sin(t * 0.4), 1040, 500, '37,99,235', 0.4 * out);
  }
  bgc.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- kinetic type
const typeEl = $('#type');
function mk(tag, cls, html, parent = typeEl) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}
class KLine {
  constructor(text, cls) {
    this.el = mk('div', 'kline ' + cls);
    this.words = text.split(' ').map(w => mk('span', 'kw', w, this.el));
    this.w = null;
  }
  measure() {
    if (this.w) return;
    this.w = this.words.map(s => s.getBoundingClientRect().width);
    this.space = parseFloat(getComputedStyle(this.el).fontSize) * 0.27;
    this.hgt = this.words[0].getBoundingClientRect().height;
  }
  // pres[i] in 0..1 is how much of word i's width it claims; the line stays centered
  layout(pres) {
    this.measure();
    let total = 0;
    pres.forEach((p, i) => { total += (this.w[i] + (i ? this.space : 0)) * p; });
    let x = -total / 2;
    this.words.forEach((s, i) => {
      if (i) x += this.space * pres[i];
      s.style.left = x + 'px';
      x += this.w[i] * pres[i];
    });
  }
  show(v) { this.el.style.display = v ? 'block' : 'none'; }
}
function wstyle(s, { o = 1, blur = 0, sweep = 0, sc = 1, sy = 1, rx = 0, ty = 0 } = {}) {
  s.style.opacity = o;
  s.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  s.style.backgroundPositionX = sweep.toFixed(2) + '%';
  s.style.transform = `translateY(-50%) translateY(${ty}px) perspective(900px) rotateX(${rx}deg) scale(${sc}, ${sc * sy})`;
}
// standard word entrance: arrives blurred and hot, cools to white left to right
function arrive(t, a, dur = 0.22) {
  return {
    p: E.outE(P(t, a, a + dur)),
    o: P(t, a, a + 0.09),
    blur: 16 * (1 - E.outC(P(t, a, a + 0.15))),
    sweep: lerp(50, 0, E.ioS(P(t, a + 0.02, a + 0.42))),
  };
}
const sweepPass = (t, a, b) => (t < a ? 100 : lerp(100, 0, E.ioS(P(t, a, b))));

const L1 = new KLine('Making videos takes hours.', 'k-light');
const L2 = new KLine('Not', 'k-bold');
const L3 = new KLine('anymore.', 'k-bold');
const L4 = new KLine('Meet', 'k-bold');
const O1 = new KLine('Vid.AI', 'k-name');
const O2 = new KLine('Your next video is one prompt away.', 'k-tag');
const O3 = new KLine('vid.ai', 'k-url');

// logo: three glyphs that open outward from a center seam
const logoEl = mk('div', 'logo');
const LOGO_S = 104 / 24, SEAM = 28.5;
const GLYPHS = [['V', 0, 24.1], ['I', 27, 6.5], ['P', 36.5, 20]].map(([k, x0, wv]) => {
  const d = mk('div', 'g', null, logoEl);
  d.style.left = ((x0 - SEAM) * LOGO_S) + 'px';
  d.innerHTML = `<svg viewBox="${x0} 0 ${wv} 24" style="width:${wv * LOGO_S}px"><defs><linearGradient id="lg${k}" gradientUnits="userSpaceOnUse" x1="-20" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#DBEAFE"/><stop offset="0.35" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#60A5FA"/><stop offset="0.65" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DBEAFE"/></linearGradient></defs><path d="${LOGO[k]}" fill="url(#lg${k})"/></svg>`;
  return { k, el: d, grad: d.querySelector('linearGradient') };
});
function poseLogo(t, t0, exitAt) {
  // t0: build start. exitAt: shrink-away start (or Infinity to hold)
  const vis = t >= t0 - 0.01 && t < exitAt + 0.2;
  logoEl.style.display = vis ? 'block' : 'none';
  if (!vis) return;
  const b = E.ioC(P(t, t0 + 0.06, t0 + 0.52));
  const iy = E.outE(P(t, t0, t0 + 0.26));
  for (const g of GLYPHS) {
    if (g.k === 'I') {
      g.el.style.transform = `scaleY(${Math.max(0.001, iy)})`;
      g.el.style.opacity = P(t, t0, t0 + 0.06);
      g.el.style.clipPath = 'none';
    } else if (g.k === 'V') {
      g.el.style.transform = `translateX(${(1 - b) * 34}px)`;
      g.el.style.clipPath = `inset(0 0 0 ${(1 - b) * 100}%)`;
      g.el.style.opacity = 1;
    } else {
      g.el.style.transform = `translateX(${-(1 - b) * 34}px)`;
      g.el.style.clipPath = `inset(0 ${(1 - b) * 100}% 0 0)`;
      g.el.style.opacity = 1;
    }
    // shimmer band in logo units
    const sx = lerp(-24, 80, E.ioS(P(t, t0 + 0.5, t0 + 0.95)));
    g.grad.setAttribute('x1', sx - 14); g.grad.setAttribute('x2', sx + 14);
  }
  const ex = E.ioC(P(t, exitAt, exitAt + 0.16));
  logoEl.style.opacity = 1 - ex;
  logoEl.style.transform = `scale(${1 - 0.3 * ex})`;
  logoEl.style.filter = ex > 0 ? `blur(${6 * ex}px)` : 'none';
}

const waveDisp = $('#waveDisp');
function updateType(t) {
  // L1: "Making videos" lands big then settles; "takes", "hours." join the line
  const on1 = t < 1.95;
  L1.show(on1);
  if (on1) {
    const a0 = { p: 1, o: P(t, 0.06, 0.16), blur: 28 * (1 - E.outC(P(t, 0.06, 0.24))) };
    const wT = arrive(t, 0.98), wH = arrive(t, 1.2);
    L1.layout([1, 1, wT.p, wH.p]);
    const s1 = sweepPass(t, 0.66, 1.05);
    const exit = E.inC(P(t, 1.72, 1.88));
    const common = b => b + 18 * exit;
    wstyle(L1.words[0], { o: a0.o * (1 - exit), blur: common(a0.blur), sweep: s1 });
    wstyle(L1.words[1], { o: a0.o * (1 - exit), blur: common(a0.blur), sweep: s1 });
    wstyle(L1.words[2], { o: wT.o * (1 - exit), blur: common(wT.blur), sweep: wT.sweep });
    wstyle(L1.words[3], { o: wH.o * (1 - exit), blur: common(wH.blur), sweep: wH.sweep });
    const sc = track(t, [[0.06, 1.95], [0.24, 1.9], [0.78, 1.0, E.outE]]) * (1 - 0.04 * exit);
    L1.el.style.transform = `scale(${sc})`;
  }
  // L2 "Not": blur in, sweep, flip away
  const on2 = t > 1.8 && t < 2.32;
  L2.show(on2);
  if (on2) {
    L2.layout([1]);
    const fl = E.inC(P(t, 2.18, 2.3));
    wstyle(L2.words[0], {
      o: P(t, 1.84, 1.94) * (1 - fl), blur: 22 * (1 - E.outC(P(t, 1.84, 2.0))),
      sc: lerp(1.22, 1, E.outE(P(t, 1.84, 2.1))), sweep: sweepPass(t, 1.9, 2.22), rx: -82 * fl,
    });
  }
  // L3 "anymore.": flips up from flat, then pinches into a line
  const on3 = t > 2.24 && t < 2.84;
  L3.show(on3);
  if (on3) {
    L3.layout([1]);
    const fi = P(t, 2.25, 2.45);
    const sq = E.inE(P(t, 2.7, 2.79));
    wstyle(L3.words[0], {
      o: P(t, 2.25, 2.31), rx: 84 * (1 - E.outB(fi)), sweep: lerp(50, 0, E.ioS(P(t, 2.3, 2.68))),
      sy: Math.max(0.02, 1 - 0.98 * sq), blur: 0,
    });
    L3.el.style.filter = sq > 0 ? 'url(#wave)' : 'none';
    if (sq > 0) waveDisp.setAttribute('scale', (30 * sq).toFixed(1));
  }
  // L4 "Meet": opens out of the same line
  const on4 = t > 2.79 && t < 3.42;
  L4.show(on4);
  if (on4) {
    L4.layout([1]);
    const op = E.outE(P(t, 2.79, 2.92));
    const ex = E.inC(P(t, 3.26, 3.38));
    wstyle(L4.words[0], { o: 1 - ex, sy: Math.max(0.02, op), sweep: sweepPass(t, 2.9, 3.22), blur: 14 * ex, sc: 1 - 0.08 * ex });
    L4.el.style.filter = op < 1 ? 'url(#wave)' : 'none';
    if (op < 1 && t < 2.92) waveDisp.setAttribute('scale', (30 * (1 - op)).toFixed(1));
  }
  // logo, twice
  if (t < 10) poseLogo(t, 3.4, 4.32);
  else poseLogo(t, 30.42, 1e9);

  // outro type
  const onO1 = t > 26.55 && t < 27.82;
  O1.show(onO1);
  if (onO1) {
    O1.layout([1]);
    const ex = E.inC(P(t, 27.62, 27.78));
    wstyle(O1.words[0], { o: P(t, 26.6, 26.8) * (1 - ex), blur: 34 * (1 - E.outC(P(t, 26.6, 27.0))) + 18 * ex, sc: lerp(1.07, 1, E.outE(P(t, 26.6, 27.2))) });
  }
  const onO2 = t > 27.8 && t < 29.2;
  O2.show(onO2);
  if (onO2) {
    O2.layout([1, 1, 1, 1, 1, 1, 1]);
    const ex = E.inC(P(t, 29.0, 29.16));
    const inn = P(t, 27.84, 27.96);
    O2.words.forEach((s, i) => {
      const sw = i >= 4 ? sweepPass(t, 28.05 + (i - 4) * 0.09, 28.5 + (i - 4) * 0.09) : 0;
      wstyle(s, { o: inn * (1 - ex), blur: 20 * (1 - E.outC(P(t, 27.84, 28.02))) + 16 * ex, sweep: sw });
    });
    O2.el.style.transform = `scale(${lerp(1.05, 1, E.outE(P(t, 27.84, 28.3)))})`;
  }
  const onO3 = t > 29.18 && t < 30.34;
  O3.show(onO3);
  if (onO3) {
    O3.layout([1]);
    const ex = E.inC(P(t, 30.16, 30.3));
    wstyle(O3.words[0], { o: P(t, 29.22, 29.34) * (1 - ex), blur: 20 * (1 - E.outC(P(t, 29.22, 29.4))) + 16 * ex });
  }
}

// ---------------------------------------------------------------- three.js hero
const glCanvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const cam = new THREE.PerspectiveCamera(28, W / H, 0.05, 100);

const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-4, 6, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x3b82f6, 4.5); rim.position.set(3, -4, -5); scene.add(rim);
const rim2 = new THREE.DirectionalLight(0x60a5fa, 1.6); rim2.position.set(5, 1, -2); scene.add(rim2);
const bounce = new THREE.PointLight(0x3b82f6, 30, 10, 2); bounce.position.set(0, -3.2, 1.8); scene.add(bounce);
scene.add(new THREE.HemisphereLight(0xdbeafe, 0x0b1020, 0.35));

const M = {
  blue: new THREE.MeshPhysicalMaterial({ color: 0x2f74f0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.95 }),
  ice: new THREE.MeshPhysicalMaterial({ color: 0xd4e4ff, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.0 }),
  white: new THREE.MeshPhysicalMaterial({ color: 0xf4f7ff, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.85 }),
  body: new THREE.MeshPhysicalMaterial({ color: 0x1b1e26, metalness: 0.75, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.0 }),
  dark: new THREE.MeshPhysicalMaterial({ color: 0x0c0e13, metalness: 0.4, roughness: 0.45, envMapIntensity: 0.7 }),
  black: new THREE.MeshPhysicalMaterial({ color: 0x040507, metalness: 0.2, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.0 }),
  lap: new THREE.MeshPhysicalMaterial({ color: 0x15171c, metalness: 0.55, roughness: 0.42, clearcoat: 0.3, envMapIntensity: 0.5 }),
};

function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function extrude(shape, depth, bevel, seg = 5) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 28 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
// rounded slab: outer size w x h, corner radius r, total thickness depth + 2*bevel
const slabGeo = (w, h, r, depth, bevel, seg) => extrude(rrShape(w - 2 * bevel, h - 2 * bevel, Math.max(0.002, r - bevel)), depth, bevel, seg);
function canvasTex(c) {
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tx;
}

// phone
const phoneCanvas = document.createElement('canvas'); phoneCanvas.width = 620; phoneCanvas.height = 1300;
const phoneCtx = phoneCanvas.getContext('2d');
const phoneTex = canvasTex(phoneCanvas);
const phone = new THREE.Group();
{
  const body = new THREE.Mesh(slabGeo(1.56, 3.22, 0.24, 0.1, 0.04), M.body); phone.add(body);
  const front = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(1.5, 3.16, 0.21), 24), M.black); front.position.z = 0.0905; phone.add(front);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.43, 3.0), new THREE.MeshBasicMaterial({ map: phoneTex, transparent: true, toneMapped: false }));
  scr.position.z = 0.092; phone.add(scr);
  const bumpM = new THREE.Mesh(slabGeo(0.64, 0.64, 0.16, 0.03, 0.02), M.body); bumpM.position.set(-0.38, 1.2, -0.1); phone.add(bumpM);
  for (const [x, y] of [[-0.52, 1.34], [-0.52, 1.06], [-0.25, 1.2]]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 32), M.black);
    l.rotation.x = Math.PI / 2; l.position.set(x, y, -0.13); phone.add(l);
  }
  const btnGeo = slabGeo(0.05, 0.38, 0.02, 0.03, 0.012);
  const b1 = new THREE.Mesh(btnGeo, M.body); b1.position.set(0.79, 0.65, 0); b1.rotation.y = Math.PI / 2; phone.add(b1);
  const b2 = new THREE.Mesh(btnGeo, M.body); b2.position.set(-0.79, 0.8, 0); b2.rotation.y = Math.PI / 2; phone.add(b2);
  const b3 = new THREE.Mesh(btnGeo, M.body); b3.position.set(-0.79, 0.3, 0); b3.rotation.y = Math.PI / 2; phone.add(b3);
}
scene.add(phone);

// laptop
const lapCanvas = document.createElement('canvas'); lapCanvas.width = 1600; lapCanvas.height = 1000;
const lapCtx = lapCanvas.getContext('2d');
const lapTex = canvasTex(lapCanvas);
const keyCanvas = document.createElement('canvas'); keyCanvas.width = 1024; keyCanvas.height = 640;
{
  const k = keyCanvas.getContext('2d');
  k.fillStyle = '#15171d'; k.fillRect(0, 0, 1024, 640);
  k.fillStyle = '#0c0d11'; rr(k, 70, 40, 884, 330, 14); k.fill();
  const rows = [14, 14, 13, 12, 11];
  rows.forEach((n, r) => {
    const kw = 884 / 14.6, y = 52 + r * 62;
    for (let i = 0; i < n; i++) {
      const x = 80 + i * kw + (14 - n) * kw * 0.5;
      k.fillStyle = '#1e2129'; rr(k, x, y, kw - 8, 52, 7); k.fill();
      k.fillStyle = 'rgba(255,255,255,0.06)'; k.fillRect(x + 4, y + 3, kw - 16, 2);
    }
  });
  k.fillStyle = '#1b1e25'; rr(k, 330, 400, 364, 220, 16); k.fill();
  k.strokeStyle = 'rgba(255,255,255,0.05)'; k.lineWidth = 2; k.stroke();
}
const keyTex = canvasTex(keyCanvas);
const laptop = new THREE.Group();
const lidPivot = new THREE.Group();
let lapScreen;
{
  const base = new THREE.Mesh(slabGeo(4.8, 3.2, 0.18, 0.08, 0.03), M.lap);
  base.rotation.x = -Math.PI / 2; laptop.add(base);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.95), new THREE.MeshStandardMaterial({ map: keyTex, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.35 }));
  deck.rotation.x = -Math.PI / 2; deck.position.y = 0.071; laptop.add(deck);
  lidPivot.position.set(0, 0.07, -1.58); laptop.add(lidPivot);
  const lid = new THREE.Mesh(slabGeo(4.8, 3.1, 0.16, 0.04, 0.015), M.lap); lid.position.set(0, 1.55, -0.02); lidPivot.add(lid);
  const bezel = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(4.74, 3.04, 0.14), 20), M.black); bezel.position.set(0, 1.55, 0.016); lidPivot.add(bezel);
  lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.8125), new THREE.MeshBasicMaterial({ map: lapTex, toneMapped: false }));
  lapScreen.position.set(0, 1.58, 0.018); lidPivot.add(lapScreen);
  const notch = new THREE.Mesh(new THREE.ShapeGeometry(rrShape(0.42, 0.12, 0.04), 8), M.black); notch.position.set(0, 3.0, 0.02); lidPivot.add(notch);
}
scene.add(laptop);

// icons
function playTile() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(slabGeo(1.0, 0.8, 0.24, 0.12, 0.07), M.blue));
  const tri = new THREE.Shape(); tri.moveTo(-0.11, -0.17); tri.lineTo(0.2, 0); tri.lineTo(-0.11, 0.17); tri.closePath();
  const m = new THREE.Mesh(extrude(tri, 0.03, 0.035, 4), M.white); m.position.set(0.0, 0, 0.15); g.add(m);
  return g;
}
function mic() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 10, 32), M.blue));
  for (const y of [0.04, -0.07]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.203, 0.02, 12, 48), M.white); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r);
  }
  const u = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.042, 14, 48, Math.PI), M.white); u.rotation.z = Math.PI; u.position.y = -0.02; g.add(u);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.3, 16), M.white); st.position.y = -0.5; g.add(st);
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.07, 40), M.blue); bs.position.y = -0.66; g.add(bs);
  return g;
}
function clapper() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(slabGeo(1.0, 0.72, 0.1, 0.08, 0.04), M.blue));
  for (const [y, w] of [[-0.02, 0.56], [-0.16, 0.36]]) {
    const l = new THREE.Mesh(slabGeo(w, 0.06, 0.03, 0.01, 0.012), M.white); l.position.set(-0.4 + w / 2 + 0.04, y, 0.085); g.add(l);
  }
  const stripes = (parent, y0, h, skew) => {
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Shape(), x = -0.5 + i * 0.2;
      s.moveTo(x, y0); s.lineTo(x + 0.2, y0); s.lineTo(x + 0.2 + skew, y0 + h); s.lineTo(x + skew, y0 + h); s.closePath();
      const m = new THREE.Mesh(extrude(s, 0.06, 0.012, 2), i % 2 ? M.white : M.blue);
      parent.add(m);
    }
  };
  const bar = new THREE.Group(); stripes(bar, 0.36, 0.13, 0.06); g.add(bar);
  const arm = new THREE.Group(); arm.position.set(-0.5, 0.5, 0);
  const inner = new THREE.Group(); inner.position.set(0.5, -0.5, 0); stripes(inner, 0.5, 0.13, -0.06); arm.add(inner);
  arm.rotation.z = 0.32; g.add(arm);
  return g;
}
function bubble() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(slabGeo(1.0, 0.7, 0.24, 0.1, 0.06), M.blue));
  const tail = new THREE.Shape(); tail.moveTo(-0.32, -0.25); tail.lineTo(-0.38, -0.5); tail.lineTo(-0.1, -0.27); tail.closePath();
  g.add(new THREE.Mesh(extrude(tail, 0.1, 0.05, 4), M.blue));
  for (const [y, w, x] of [[0.09, 0.6, 0], [-0.08, 0.38, -0.11]]) {
    const l = new THREE.Mesh(slabGeo(w, 0.085, 0.042, 0.02, 0.02), M.white); l.position.set(x, y, 0.12); g.add(l);
  }
  return g;
}
function sparkle(mat) {
  const s = new THREE.Shape(), R = 0.42, r = 0.07;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, a2 = a + Math.PI / 2, am = a + Math.PI / 4;
    if (i === 0) s.moveTo(Math.cos(a) * R, Math.sin(a) * R);
    s.quadraticCurveTo(Math.cos(am) * r, Math.sin(am) * r, Math.cos(a2) * R, Math.sin(a2) * R);
  }
  return new THREE.Mesh(extrude(s, 0.05, 0.05, 5), mat);
}
function dashes() {
  const g = new THREE.Group();
  [[0, 0.22, 0.35], [0.2, 0.02, 0], [0.12, -0.2, -0.4]].forEach(([x, y, a]) => {
    const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.17, 6, 16), M.white);
    c.position.set(x, y, 0); c.rotation.z = Math.PI / 2 + a; g.add(c);
  });
  return g;
}
const ICONS = [
  { o: playTile(), ph: [-1.6, 0.95, 0.35], pr: [0.15, 0.55, -0.12], lp: [-3.0, 1.25, 0.1], lr: [0.2, 0.5, -0.1], s: 0.95, d: 0.0 },
  { o: mic(), ph: [1.55, 0.85, 0.35], pr: [0.05, -0.45, 0.2], lp: [2.95, 1.3, 0.0], lr: [0.05, -0.5, 0.15], s: 1.0, d: 0.06 },
  { o: clapper(), ph: [-1.4, -1.1, 0.7], pr: [0.1, 0.6, 0.12], lp: [-2.85, -1.0, 0.9], lr: [0.1, 0.55, 0.1], s: 0.9, d: 0.12 },
  { o: bubble(), ph: [1.4, -1.1, 0.7], pr: [0.12, -0.55, -0.08], lp: [2.8, -0.85, 0.9], lr: [0.12, -0.5, -0.08], s: 0.92, d: 0.18 },
  { o: sparkle(M.ice), ph: [0.95, 1.85, -0.3], pr: [0.2, -0.3, 0.3], lp: [1.9, 2.05, -0.7], lr: [0.2, -0.3, 0.3], s: 0.62, d: 0.24 },
  { o: sparkle(M.white), ph: [-0.55, 1.95, -0.4], pr: [0.1, 0.3, -0.2], lp: [-1.75, 2.15, -0.7], lr: [0.1, 0.3, -0.2], s: 0.34, d: 0.3 },
  { o: dashes(), ph: [2.15, 1.25, 0.3], pr: [0, -0.3, 0], lp: [3.55, 1.6, 0.0], lr: [0, -0.3, 0], s: 0.9, d: 0.1 },
];
ICONS.forEach((ic, i) => { ic.phase = i * 1.7; scene.add(ic.o); });

const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), v3c = new THREE.Vector3();
const camStart = new THREE.Vector3(), lookStart = new THREE.Vector3();
function updateHero(t) {
  const on = t >= 4.42 && t < 9.86;
  glCanvas.style.display = on ? 'block' : 'none';
  if (!on) return;
  glCanvas.style.opacity = 1 - P(t, 9.73, 9.84);

  const d = t - 4.42;
  cam.fov = 28;
  cam.position.set(0.45 * Math.sin(d * 0.33) - 0.15, 0.25 + 0.12 * Math.sin(d * 0.27), 11.2 - 0.13 * d);
  v3.set(0, 0, 0);
  if (t > 7.4) v3.set(0, -0.12, 0);
  cam.lookAt(v3);

  // phone: spins in from edge-on, turns slowly, then spins out edge-on
  phone.visible = t < 7.36;
  const pry = track(t, [[4.45, -Math.PI / 2], [4.98, -0.45, E.outC], [7.2, -0.14, E.ioS], [7.36, Math.PI / 2, E.inC]]);
  phone.rotation.set(0.08, pry, 0.04);
  phone.position.set(0.12, 0.03 * Math.sin(t * 1.1), 0);
  phone.scale.setScalar(lerp(0.9, 1, E.outC(P(t, 4.45, 5.0))));
  drawPhoneScreen(t - 4.45);

  // laptop: comes out of the same spin and opens
  laptop.visible = t >= 7.36;
  laptop.rotation.set(0.3, track(t, [[7.36, -Math.PI / 2], [7.68, -0.32, E.outC], [9.4, -0.06, E.ioS]]), 0);
  laptop.position.set(0, -1.32, 0);
  laptop.scale.setScalar(0.9);
  lidPivot.rotation.x = track(t, [[7.36, 1.1], [7.85, -0.2, E.outC]]);
  if (laptop.visible) { drawLaptopScreen(lapCtx, 1600, 1000, t); lapTex.needsUpdate = true; }

  // icons: pop out of the phone, float, re-arrange around the laptop
  const k = E.ioC(P(t, 7.2, 7.78));
  ICONS.forEach(ic => {
    const ap = P(t, 4.56 + ic.d, 5.0 + ic.d);
    const s = ic.s * Math.max(0, E.outB(ap));
    ic.o.visible = s > 0.001;
    ic.o.scale.setScalar(Math.max(0.0001, s));
    const fx = lerp(ic.ph[0], ic.lp[0], k), fy = lerp(ic.ph[1], ic.lp[1], k), fz = lerp(ic.ph[2], ic.lp[2], k);
    const out = E.outC(ap);
    ic.o.position.set(lerp(0.12, fx, out), lerp(0, fy, out) + 0.07 * Math.sin(t * 1.25 + ic.phase), lerp(0, fz, out));
    ic.o.rotation.set(
      lerp(ic.pr[0], ic.lr[0], k) + 0.06 * Math.sin(t * 0.9 + ic.phase),
      lerp(ic.pr[1], ic.lr[1], k) + 0.18 * Math.sin(t * 0.7 + ic.phase) + k * Math.PI * 2 + (1 - out) * 1.4,
      lerp(ic.pr[2], ic.lr[2], k));
  });

  // screen extraction: dive at the card in the middle of the laptop screen
  if (t > 9.4) {
    const u = E.inC(P(t, 9.42, 9.8));
    laptop.updateMatrixWorld(true);
    lapScreen.localToWorld(v3b.set(0, -0.197, 0));
    lapScreen.localToWorld(v3c.set(0, -0.197, 1)).sub(v3b).normalize();
    camStart.copy(cam.position); lookStart.copy(v3);
    cam.position.lerpVectors(camStart, v3c.multiplyScalar(3.7).add(v3b), u);
    v3.lerpVectors(lookStart, v3b, u);
    cam.lookAt(v3);
    cam.fov = lerp(28, 26, u);
  }
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
}
function drawPhoneScreen(vt) {
  const c = phoneCtx, w = 620, h = 1300;
  c.clearRect(0, 0, w, h);
  c.save(); rr(c, 0, 0, w, h, 80); c.clip();
  drawShort(c, w, h, Math.max(0, vt), true);
  c.restore();
  phoneTex.needsUpdate = true;
}

// ---------------------------------------------------------------- glass slab
const stageWrap = $('#stageWrap'), slab = $('#slab');
const SLAB = [
  { t: 9.74, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
  { t: 10.3, x: -20, y: 40, z: -220, rx: 9, ry: -17, rz: -2, e: E.outE },
  { t: 10.95, x: -40, y: 300, z: 430, rx: 12, ry: -22, rz: -3, e: E.ioC },
  { t: 12.95, x: -80, y: 230, z: 520, rx: 9, ry: -14, rz: -2, e: E.ioS },
  { t: 13.3, x: 0, y: 0, z: -70, rx: 5, ry: 346, rz: -1, e: E.ioE },
  { t: 15.45, x: 0, y: 30, z: 40, rx: 6, ry: 350, rz: -1, e: E.ioS },
  { t: 16.2, x: -10, y: -170, z: 240, rx: 9, ry: 346, rz: -2, e: E.ioC },
  { t: 17.2, x: -10, y: -200, z: 280, rx: 8, ry: 348, rz: -2, e: E.ioS },
  { t: 18.0, x: 0, y: -330, z: 420, rx: 10, ry: 356, rz: -1, e: E.ioC },
  { t: 19.42, x: 0, y: -310, z: 450, rx: 9, ry: 362, rz: 0, e: E.ioS },
  { t: 19.8, x: 0, y: 0, z: 40, rx: 4, ry: 722, rz: 0, e: E.ioE },
  { t: 21.45, x: 10, y: 10, z: 130, rx: 5, ry: 716, rz: 0.5, e: E.ioS },
  { t: 23.42, x: -10, y: -50, z: 210, rx: 6, ry: 712, rz: 0, e: E.ioS },
  { t: 23.78, x: 0, y: 0, z: 60, rx: 4, ry: 1072, rz: 0, e: E.ioE },
  { t: 24.5, x: 20, y: -110, z: 220, rx: 8, ry: 1066, rz: -1, e: E.ioS },
  { t: 25.39, x: 0, y: -330, z: 520, rx: 10, ry: 1072, rz: 0, e: E.ioC },
  { t: 25.4, x: 0, y: 40, z: 230, rx: 14, ry: 1076, rz: -2, cut: true },
  { t: 26.4, x: 0, y: 20, z: 300, rx: 12, ry: 1080, rz: -1.5, e: E.ioS },
  { t: 26.85, x: 0, y: 0, z: 180, rx: 10, ry: 1082, rz: -1, e: E.outC },
];
const AX = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
function slabPose(t) {
  const K = SLAB;
  if (t <= K[0].t) return K[0];
  for (let i = 1; i < K.length; i++) {
    if (t < K[i].t || (i === K.length - 1)) {
      if (K[i].cut && t < K[i].t) return K[i - 1];
      const u = (K[i].e || E.ioC)(P(t, K[i - 1].t, K[i].t));
      const o = {}; AX.forEach(a => { o[a] = lerp(K[i - 1][a], K[i][a], u); });
      return o;
    }
  }
}
function crossTime(target, t0, t1) {
  let a = t0, b = t1;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (slabPose(m).ry < target) a = m; else b = m; }
  return (a + b) / 2;
}
const SWAP1 = crossTime(362 + 270, 19.42, 19.8);
const SWAP2 = crossTime(712 + 270, 23.42, 23.78);
const T_CUT = 25.4;
function updateSlab(t) {
  const on = t >= 9.73 && t < 26.9;
  stageWrap.style.display = on ? 'block' : 'none';
  if (!on) return false;
  const p = slabPose(t);
  slab.style.transform = `translate3d(${p.x}px, ${p.y}px, ${p.z}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`;
  let blur = 0;
  if (t < 9.86) blur = 10 * (1 - P(t, 9.74, 9.86));
  if (t >= T_CUT) blur = 24 * (1 - E.outC(P(t, T_CUT, T_CUT + 0.24)));
  blur += 38 * E.inC(P(t, 26.32, 26.72));
  stageWrap.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  stageWrap.style.opacity = P(t, 9.73, 9.81) * (1 - P(t, 26.5, 26.82));
  return true;
}

// ---------------------------------------------------------------- UI states
const S = [1, 2, 3, 4, 5].map(i => $('#s' + i));
const PROMPT = "A lone hiker's 40-day journey to the top of the world";
const typed = $('#typed'), ph = $('#ph'), caret = $('#caret'), promptEl = $('#prompt'), countEl = $('#count');
const waveEl = $('#wave');
const WAVE_N = 18;
for (let i = 0; i < WAVE_N; i++) waveEl.appendChild(document.createElement('i'));
const waveBars = [...waveEl.children];
const tabInd = $('#tabInd');
const tabs = [$('#tabFaceless'), $('#tabShort'), $('#tabAvatar')];
const checks = [...document.querySelectorAll('#checks li')];
const pvCanvas = $('#pvCanvas'), pvCtx = pvCanvas.getContext('2d');
const barsEl = [...document.querySelectorAll('#bars i')];
const CLICKS = [13.92, 14.62, 15.22, 16.42, 18.25, 22.52, 23.36, 24.32, 25.18];
const setCls = (el, cls, on) => el.classList.toggle(cls, !!on);
const fmt = n => Math.round(n).toLocaleString('en-US');

function updateUI(t) {
  // which card face is showing
  let st = 1;
  if (t >= SWAP1) st = 2;
  if (t >= 21.45) st = 3;
  if (t >= SWAP2) st = 4;
  if (t >= T_CUT) st = 5;
  const x23 = P(t, 21.45, 21.62);
  S.forEach((el, i) => {
    let o = st === i + 1 ? 1 : 0;
    if (st === 3 && i === 1) o = 1 - x23;
    if (st === 3 && i === 2) o = x23;
    el.style.opacity = o;
    el.style.display = o > 0 ? 'flex' : 'none';
  });

  // steps + tabs
  setCls($('#st2'), 'dim', t < 13.92);
  setCls($('#st3'), 'dim', t < 18.25);
  const ti = E.outE(P(t, 13.92, 14.16));
  tabInd.style.left = (ti * 33.333) + '%';
  tabs.forEach((el, i) => setCls(el, 'on', (i === 0 && ti < 0.5) || (i === 1 && ti >= 0.5)));

  if (st === 1) {
    const n = Math.floor(P(t, 10.62, 12.3) * PROMPT.length);
    typed.textContent = PROMPT.slice(0, n);
    ph.style.display = n ? 'none' : 'block';
    const typing = t > 10.62 && t < 12.35;
    caret.style.opacity = (t > 10.45 && t < 13.3 && (typing || Math.floor(t * 2.5) % 2 === 0)) ? 1 : 0;
    if (!n) caret.style.position = 'absolute'; else caret.style.position = 'static';
    setCls(promptEl, 'focus', t > 10.45 && t < 13.3);
    countEl.textContent = `${n} / 2,000`;
    const von = t >= 15.22;
    setCls($('#voice'), 'on', von);
    waveBars.forEach((b, i) => {
      let hgt = 8 + 16 * Math.abs(Math.sin(i * 1.7));
      if (von && t < 16.9) hgt = 6 + 28 * Math.abs(Math.sin(t * 9 + i * 0.9) * Math.sin(t * 4.3 + i * 0.37));
      b.style.height = hgt.toFixed(1) + 'px';
    });
    setCls($('#len30'), 'on', t < 14.62);
    setCls($('#len60'), 'on', t >= 14.62);
    const sOn = t >= 16.42;
    setCls($('#styCine'), 'on', sOn);
    const chk = $('#styCine .chk');
    chk.style.opacity = sOn ? 1 : 0;
    chk.style.transform = `scale(${sOn ? E.outB(P(t, 16.42, 16.62)) : 0})`;
    const gen = $('#gen');
    setCls(gen, 'on', t >= 16.5);
    const press = bump(P(t, 18.25, 18.4));
    gen.style.transform = `scale(${(1 + 0.035 * bump(P(t, 16.5, 16.75))) * (1 - 0.03 * press)})`;
    $('#genSheen').style.left = lerp(-40, 130, E.ioS(P(t, 18.27, 18.8))) + '%';
  }
  if (st === 2 || (st === 3 && x23 < 1)) {
    $('#spinArc').setAttribute('transform', `rotate(${-90 + t * 420} 48 48)`);
    const done = [20.05, 20.35, 20.65, 20.95, 21.2];
    checks.forEach((li, i) => {
      const d = t >= done[i];
      setCls(li, 'done', d);
      const cur = !d && (i === 0 || t >= done[i - 1]);
      li.querySelector('.st').textContent = d ? 'Done' : cur ? 'In progress' : '';
      li.querySelector('.dot').innerHTML = d ? '<svg width="18" height="18" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
    });
    const pr = E.ioS(P(t, 19.85, 21.3));
    $('#progBar').style.width = (pr * 100).toFixed(1) + '%';
    $('#pct').textContent = Math.round(pr * 100) + '%';
  }
  if (st === 3) {
    pvCtx.clearRect(0, 0, 300, 533);
    drawShort(pvCtx, 300, 533, t - 21.45);
    $('#tlFill').style.width = (P(t, 21.45, 23.6) * 100).toFixed(1) + '%';
    const ex = P(t, 22.55, 22.95);
    $('#exportFill').style.width = (ex * 100).toFixed(1) + '%';
    $('#exportLbl').textContent = t < 22.55 ? 'Export 1080p' : ex < 1 ? `Exporting ${Math.round(ex * 100)}%` : 'Exported ✓';
    $('#exportBtn').style.transform = `scale(${1 - 0.04 * bump(P(t, 22.52, 22.66))})`;
    $('#postBtn').style.transform = `scale(${1 - 0.04 * bump(P(t, 23.36, 23.5))})`;
  }
  if (st === 4) {
    [['#tg1', 0], ['#tg2', 0], ['#tg3', 24.32]].forEach(([id, at]) => {
      const u = at ? E.outC(P(t, at, at + 0.18)) : 1;
      const el = $(id);
      el.style.background = u > 0.5 ? '#3B82F6' : '#D7DCE6';
      el.firstElementChild.style.left = (4 + 28 * u) + 'px';
    });
    $('#pubBtn').style.transform = `scale(${1 - 0.03 * bump(P(t, 25.18, 25.32))})`;
    $('#pubSheen').style.left = lerp(-40, 130, E.ioS(P(t, 25.0, 25.38))) + '%';
  }
  if (st === 5) {
    const c = E.outC(P(t, T_CUT + 0.12, 26.3));
    $('#views').textContent = fmt(12480 * c);
    $('#likes').textContent = fmt(1936 * c);
    const hs = [18, 26, 22, 34, 41, 38, 55, 63, 78, 96];
    barsEl.forEach((b, i) => { b.style.height = (hs[i] * E.outC(P(t, T_CUT + 0.1 + i * 0.05, T_CUT + 0.5 + i * 0.05))) + '%'; });
  }
}

// ---------------------------------------------------------------- cursor (screen space, aimed at live UI elements)
const cursor = mk('div', null, null, $('#frame'));
cursor.id = 'cursor';
cursor.innerHTML = `<svg viewBox="0 0 32 40">
  <g fill="#0b0b0d" stroke="#0b0b0d" stroke-width="3" stroke-linejoin="round">
    <rect x="8.5" y="1.5" width="5.6" height="20" rx="2.8"/><rect x="14" y="11.5" width="5.2" height="12.5" rx="2.6"/>
    <rect x="19.2" y="13" width="5" height="11.5" rx="2.5"/><rect x="24.1" y="15" width="4.6" height="10" rx="2.3"/>
    <rect x="8.5" y="17" width="20.2" height="16" rx="6.5"/><rect x="2.4" y="15.5" width="5.4" height="11.5" rx="2.7" transform="rotate(-38 5.1 21.2)"/>
    <rect x="11.5" y="28" width="14.5" height="9" rx="3"/></g>
  <g fill="#ffffff">
    <rect x="8.5" y="1.5" width="5.6" height="20" rx="2.8"/><rect x="14" y="11.5" width="5.2" height="12.5" rx="2.6"/>
    <rect x="19.2" y="13" width="5" height="11.5" rx="2.5"/><rect x="24.1" y="15" width="4.6" height="10" rx="2.3"/>
    <rect x="8.5" y="17" width="20.2" height="16" rx="6.5"/><rect x="2.4" y="15.5" width="5.4" height="11.5" rx="2.7" transform="rotate(-38 5.1 21.2)"/>
    <rect x="11.5" y="28" width="14.5" height="9" rx="3"/></g>
  <g stroke="#0b0b0d" stroke-width="1.3" stroke-linecap="round"><path d="M14 17.5v5M19.2 18.5v5M24.1 19.5v5"/></g>
</svg>`;
const HOT = { x: 17, y: 3 };
const ripples = [0, 1, 2].map(() => { const r = mk('div', 'ripple', '<i></i>', $('#frame')); return r; });
const CUR = [
  [13.35, { x: 560, y: 1010 }],
  [13.84, '#tabShort'],
  [14.54, '#len60'],
  [15.14, '#voice', -120, 0],
  [16.34, '#styCine', 10, 10],
  [17.95, '#gen', -40, 6],
  [18.9, '#gen', 70, 40],
  [20.5, { x: 1490, y: 760 }],
  [22.45, '#exportBtn', 10, 4],
  [23.28, '#postBtn', 0, 4],
  [24.24, '#tg3', 4, 2],
  [25.1, '#pubBtn', 30, 6],
  [25.4, { x: 1150, y: 660 }],
  [26.3, { x: 1185, y: 610 }],
];
function targetPoint(w) {
  const [, tg, dx = 0, dy = 0] = w;
  if (typeof tg === 'object') return { x: tg.x, y: tg.y };
  const r = $(tg).getBoundingClientRect();
  return { x: r.left + r.width / 2 + dx, y: r.top + r.height / 2 + dy };
}
function updateCursor(t) {
  const vis = P(t, 13.35, 13.5) * (1 - P(t, 26.2, 26.36));
  cursor.style.opacity = vis;
  if (vis <= 0) { ripples.forEach(r => (r.style.display = 'none')); return; }
  let i = 1; while (i < CUR.length - 1 && t > CUR[i][0]) i++;
  const a = CUR[i - 1], b = CUR[i];
  const pa = targetPoint(a), pb = targetPoint(b);
  const travel = Math.min(0.62, b[0] - a[0] - 0.12);
  let u = E.ioC(P(t, b[0] - travel, b[0]));
  if (b[0] === T_CUT) u = t >= T_CUT ? 1 : 0;
  const arc = 40 * bump(u) * (i % 2 ? 1 : -1);
  const dx = pb.x - pa.x, dy = pb.y - pa.y, L = Math.hypot(dx, dy) || 1;
  const x = lerp(pa.x, pb.x, u) + (-dy / L) * arc, y = lerp(pa.y, pb.y, u) + (dx / L) * arc;
  let press = 0;
  CLICKS.forEach(c => { press = Math.max(press, bump(P(t, c - 0.04, c + 0.12))); });
  cursor.style.transform = `translate(${x - HOT.x}px, ${y - HOT.y}px) scale(${1 - 0.16 * press})`;
  // click ripples
  let ri = 0;
  ripples.forEach(r => (r.style.display = 'none'));
  CLICKS.forEach(c => {
    const u2 = P(t, c, c + 0.5);
    if (u2 > 0 && u2 < 1 && ri < ripples.length) {
      const r = ripples[ri++];
      if (!r._at || r._c !== c) { r._at = { x, y }; r._c = c; }
      r.style.display = 'block';
      r.style.transform = `translate(${r._at.x}px, ${r._at.y}px)`;
      const ring = r.firstElementChild;
      ring.style.opacity = (0.9 * (1 - u2)).toFixed(3);
      ring.style.transform = `scale(${0.3 + 1.3 * E.outC(u2)})`;
    }
  });
}

// ---------------------------------------------------------------- grain + fade
const grainC = $('#grain'), grainCtx = grainC.getContext('2d');
const GRAIN = [];
for (let k = 0; k < 6; k++) {
  const id = grainCtx.createImageData(960, 540);
  let seed = 1234 + k * 7919;
  for (let i = 0; i < id.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 128 + ((seed >>> 24) - 128) * 0.9;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
  }
  GRAIN.push(id);
}
const fadeEl = $('#fade');

// ---------------------------------------------------------------- frame entry points
function renderAt(t) {
  drawBG(t);
  updateType(t);
  updateHero(t);
  if (updateSlab(t)) { updateUI(t); }
  updateCursor(t);
  grainCtx.putImageData(GRAIN[Math.floor(t * 30) % GRAIN.length], 0, 0);
  fadeEl.style.opacity = P(t, 33.05, 33.5);
}
// how many sub-frames to average for motion blur at time t
const FAST = [[2.16, 2.95], [3.24, 3.42], [4.4, 5.06], [7.16, 7.8], [9.4, 9.9], [12.94, 13.34], [19.4, 19.84], [23.4, 23.82]];
function samplesAt(t) { return FAST.some(([a, b]) => t >= a && t <= b) ? 5 : 1; }

window.DURATION = DURATION;
window.renderAt = renderAt;
window.samplesAt = samplesAt;
window.ready = (async () => {
  await loadImages();
  await document.fonts.ready;
  renderAt(0);
  return true;
})();
