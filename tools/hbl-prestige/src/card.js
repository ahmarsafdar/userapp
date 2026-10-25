// The HBL Prestige card: artwork for both faces, the metal body, the chip and the copper logo.
// Units: the scene uses centimetres (the card is 8.56 × 5.398); artwork is laid out in millimetres.
import * as THREE from 'three';

export const CARD = { w: 8.56, h: 5.398, r: 0.318, t: 0.08, bevel: 0.016 };
const WMM = 85.6, HMM = 53.98;

// ---------- type ----------
const FONTS = {
  OSLight: 'OpenSans-Light.ttf', OSBold: 'OpenSans-Bold.ttf', Barlow: 'Barlow-Medium.ttf',
  BarlowCond: 'BarlowCondensed-SemiBold.ttf', Poppins: 'Poppins-Medium.ttf',
};
export async function loadFonts(base = 'fonts/') {
  await Promise.all(Object.entries(FONTS).map(async ([family, file]) => {
    const f = new FontFace(family, `url(${base}${file})`);
    await f.load();
    document.fonts.add(f);
  }));
}

// ---------- outlines ----------
// Closed polygon with a fillet at each corner; a corner's radius is its third value (or `rad`).
export function fillet(pts, rad = 0, seg = 8) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const r = p1[2] ?? rad;
    const e1 = [p1[0] - p0[0], p1[1] - p0[1]], e2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const L1 = Math.hypot(...e1), L2 = Math.hypot(...e2);
    const d1 = [e1[0] / L1, e1[1] / L1], d2 = [e2[0] / L2, e2[1] / L2];
    const turn = d1[0] * d2[1] - d1[1] * d2[0];
    const ang = Math.acos(Math.max(-1, Math.min(1, -(d1[0] * d2[0] + d1[1] * d2[1]))));
    if (!r || Math.abs(turn) < 1e-6) { out.push([p1[0], p1[1]]); continue; }
    let tl = r / Math.tan(ang / 2);
    tl = Math.min(tl, L1 * 0.5, L2 * 0.5);
    const rr = tl * Math.tan(ang / 2);
    const a = [p1[0] - d1[0] * tl, p1[1] - d1[1] * tl], b = [p1[0] + d2[0] * tl, p1[1] + d2[1] * tl];
    const nrm = turn > 0 ? [-d1[1], d1[0]] : [d1[1], -d1[0]];
    const c = [a[0] + nrm[0] * rr, a[1] + nrm[1] * rr];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]), a1 = Math.atan2(b[1] - c[1], b[0] - c[0]);
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= seg; k++) { const t = a0 + da * k / seg; out.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr]); }
  }
  return out;
}

// The HBL wordmark, measured from the card artwork: cap height = 1, origin at the bottom-left of the H, y up.
// Its quirks are kept: the H crossbar and the B's middle bar both stop short of the left stem, and the L's foot is cut on a slant.
export function hblGlyphs() {
  const s = 0.012;
  return [
    { outer: fillet([[0, 0], [0.249, 0], [0.249, 1], [0, 1]], s) },
    { outer: fillet([[0.330, 0.417], [0.579, 0.417], [0.579, 0], [0.825, 0], [0.825, 1], [0.579, 1], [0.579, 0.625], [0.330, 0.625]], s) },
    {
      outer: fillet([[1.226, 0, s], [2.234, 0, 0.25], [2.234, 0.40, 0.12], [2.128, 0.532, 0.05], [2.209, 0.66, 0.12], [2.209, 1, 0.22], [1.226, 1, s]], 0, 10),
      holes: [fillet([[1.469, 0.209, 0.02], [1.993, 0.209, 0.09], [1.993, 0.417, 0.05], [1.553, 0.417, 0.012], [1.553, 0.615, 0.03],
        [1.983, 0.615, 0.06], [1.983, 0.792, 0.075], [1.469, 0.792, 0.012]], 0, 8)],
    },
    { outer: fillet([[2.408, 0], [3.158, 0], [3.260, 0.228], [2.653, 0.228], [2.653, 1], [2.408, 1]], s) },
  ];
}

export function hblShapes() {
  return hblGlyphs().map((g) => {
    const shape = new THREE.Shape(g.outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of g.holes || []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    return shape;
  });
}

// Canvas path of the wordmark, baseline-left at (x, y) in canvas pixels, cap height `cap` pixels.
function hblPath(x, y, cap) {
  const p = new Path2D();
  for (const g of hblGlyphs()) {
    for (const c of [g.outer, ...(g.holes || [])]) {
      c.forEach(([u, v], i) => (i ? p.lineTo : p.moveTo).call(p, x + u * cap, y - v * cap));
      p.closePath();
    }
  }
  return p;
}

// ---------- artwork ----------
// Each face is drawn twice in millimetres: colour, and a height map for the raised print (turned into a normal map).
// props: G = roughness, B = metalness (three.js reads those channels).
function surface(Wpx) {
  const S = Wpx / WMM, Hpx = Math.round(HMM * S);
  const mk = () => { const c = document.createElement('canvas'); c.width = Wpx; c.height = Hpx; return c; };
  const color = mk(), height = mk(), props = mk();
  const cx = color.getContext('2d'), hx = height.getContext('2d'), px = props.getContext('2d');
  for (const x of [cx, hx, px]) { x.setTransform(S, 0, 0, S, 0, 0); x.textBaseline = 'alphabetic'; }
  return { S, Wpx, Hpx, color, height, props, cx, hx, px };
}

// paint something on all three layers: colour, height (0–1), roughness, metalness
function paint(sf, draw, col, h, rough, metal) {
  sf.cx.fillStyle = sf.cx.strokeStyle = col; draw(sf.cx);
  const hv = Math.round(h * 255); sf.hx.fillStyle = sf.hx.strokeStyle = `rgb(${hv},${hv},${hv})`; draw(sf.hx);
  sf.px.fillStyle = sf.px.strokeStyle = `rgb(0,${Math.round(rough * 255)},${Math.round(metal * 255)})`; draw(sf.px);
}

const text = (str, x, y, font, opts = {}) => (ctx) => {
  ctx.font = font;
  ctx.letterSpacing = opts.spacing || '0px';
  ctx.textAlign = opts.align || 'left';
  if (opts.width) {
    // fit the ink width exactly by scaling horizontally
    const m = ctx.measureText(str);
    const w = m.actualBoundingBoxRight + m.actualBoundingBoxLeft;
    ctx.save(); ctx.translate(x, y); ctx.scale(opts.width / w, 1);
    ctx.fillText(str, opts.align === 'center' ? 0 : m.actualBoundingBoxLeft, 0);
    ctx.restore();
  } else ctx.fillText(str, x, y);
};

function mastercard(sf, cx, cy, D, gap = 0.62) {
  const R = D / 2, lx = cx - D * gap / 2, rx = cx + D * gap / 2;
  const circle = (x) => (ctx) => { ctx.beginPath(); ctx.arc(x, cy, R, 0, Math.PI * 2); ctx.fill(); };
  paint(sf, circle(lx), '#6c6c6e', 0.35, 0.3, 0.75);
  paint(sf, circle(rx), '#d9d9da', 0.35, 0.3, 0.75);
  const lens = (ctx) => { ctx.save(); ctx.beginPath(); ctx.arc(lx, cy, R, 0, Math.PI * 2); ctx.clip(); ctx.beginPath(); ctx.arc(rx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
  paint(sf, lens, '#a3a3a5', 0.42, 0.28, 0.75);
  const outline = (ctx) => {
    ctx.save(); ctx.lineWidth = D * 0.024;
    ctx.beginPath(); ctx.arc(lx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.arc(rx, cy, R - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.lineWidth = D * 0.024;
    ctx.beginPath(); ctx.arc(rx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.beginPath(); ctx.arc(lx, cy, R - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  paint(sf, outline, '#161617', 0.3, 0.4, 0.2);
}

// Front layout, from the supplied design re-fitted to an ISO ID-1 card.
export const FRONT = {
  logo: { x: 5.9, top: 4.6, cap: 5.24 },
  chip: { x: 13.0, y: 19.4, w: 10.8, h: 8.6 },
  mc: { x: 71.75, y: 42.3, d: 9.8 },
};

function base(sf, tone) {
  paint(sf, (ctx) => ctx.fillRect(0, 0, WMM, HMM), tone, 0.0, 0.3, 0.0);
  // a whisper of variation in the lacquer so it never reads as flat CG
  const n = 9000, ctx = sf.px;
  for (let i = 0; i < n; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * WMM, y = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1 * HMM;
    ctx.fillStyle = `rgba(0,${100 + (i % 17)},0,0.25)`;
    ctx.fillRect(x, y, 0.6, 0.6);
  }
}

export function frontArtwork(Wpx, { name = 'AHMAR SAFDAR' } = {}) {
  const sf = surface(Wpx);
  base(sf, '#0f0f10');
  const L = FRONT.logo, baseline = L.top + L.cap;
  // copper wordmark (a separate raised mesh sits on top; this is what shows under its bevel)
  paint(sf, (ctx) => ctx.fill(hblPath(L.x, baseline, L.cap), 'evenodd'), '#e59f7c', 0.0, 0.25, 1.0);
  paint(sf, text('Prestige', L.x + 3.494 * L.cap, baseline - 0.077 * L.cap, `${0.686 * L.cap}px OSLight`, { width: 2.34 * L.cap }), '#ececec', 0.55, 0.5, 0);

  // world elite debit — top right, left-aligned block ending at the right margin
  const weSize = 3.15, weRight = 79.7;
  sf.cx.font = `${weSize}px OSBold`;
  const weW = sf.cx.measureText('world elite').width;
  paint(sf, text('world elite', weRight - weW, L.top + 0.76 * weSize, `${weSize}px OSBold`), '#f2f2f2', 0.55, 0.5, 0);
  paint(sf, text('debit', weRight - weW, L.top + 0.76 * weSize + 3.5, `${weSize}px OSBold`), '#f2f2f2', 0.55, 0.5, 0);

  // chip recess: a hairline shadow ring around where the chip sits
  const C = FRONT.chip;
  paint(sf, (ctx) => { ctx.beginPath(); ctx.roundRect(C.x - C.w / 2 - 0.25, C.y - C.h / 2 - 0.25, C.w + 0.5, C.h + 0.5, 1.0); ctx.fill(); }, '#040404', 0.0, 0.6, 0.0);

  // contactless indicator
  const contactless = (ctx) => {
    ctx.lineWidth = 0.95; ctx.lineCap = 'round';
    const ox = 18.6, oy = C.y;
    for (let k = 0; k < 4; k++) {
      const r = 2.1 + k * 1.55, th = 0.70 - k * 0.045;
      ctx.beginPath(); ctx.arc(ox, oy, r, -th, th); ctx.stroke();
    }
  };
  paint(sf, contactless, '#f0f0f0', 0.5, 0.5, 0);

  // card number: four groups of evenly spaced digits
  const digits = '4111 1111 1111 1111'.split(' ');
  const nSize = 6.5, nBase = 31.2, gW = 15.0, gGap = (79.7 - 7.2 - 4 * gW) / 3;
  digits.forEach((g, gi) => {
    [...g].forEach((d, di) => {
      const x = 7.2 + gi * (gW + gGap) + (di + 0.5) * gW / 4;
      paint(sf, text(d, x, nBase, `${nSize}px Barlow`, { align: 'center' }), '#e8e8e8', 0.8, 0.45, 0);
    });
  });
  paint(sf, text('12/28', 79.7, 36.9, `${5.5}px Barlow`, { align: 'right', spacing: '0.25px' }), '#e8e8e8', 0.7, 0.45, 0);
  paint(sf, text(name, 7.3, 46.4, `${5.05}px BarlowCond`, { spacing: '0.12px' }), '#f0f0f0', 0.7, 0.45, 0);

  const M = FRONT.mc;
  mastercard(sf, M.x, M.y, M.d);
  paint(sf, text('mastercard', M.x, 50.6, `${3.2}px Poppins`, { align: 'center', width: 16.0 }), '#b9b9ba', 0.4, 0.35, 0.3);
  return sf;
}

export function backArtwork(Wpx) {
  const sf = surface(Wpx);
  base(sf, '#0f0f10');
  paint(sf, (ctx) => ctx.fillRect(0, 5.5, WMM, 9.1), '#59595c', 0.25, 0.3, 0.55);
  paint(sf, text('SIGNATURE', 6.6, 29.0, `${4.75}px Barlow`, { spacing: '0.22px' }), '#cfcfcf', 0.5, 0.5, 0);
  paint(sf, text('789', 78.6, 29.0, `${6.6}px Barlow`, { align: 'right', spacing: '0.2px' }), '#f4f4f4', 0.6, 0.45, 0);
  paint(sf, text('LAST 4 DIGITS: 1111', 7.0, 33.4, `${3.5}px BarlowCond`, { spacing: '0.12px' }), '#dedede', 0.5, 0.5, 0);
  paint(sf, (ctx) => ctx.fillRect(5.3, 35.8, 75.0, 0.22), '#8d8d8d', 0.3, 0.5, 0);
  mastercard(sf, 14.3, 43.6, 9.6);
  paint(sf, (ctx) => ctx.fill(hblPath(36.4, 46.3, 5.2), 'evenodd'), '#f4f4f4', 0.5, 0.45, 0);
  paint(sf, text('*Terms and Conditions apply', 79.6, 50.6, `${1.75}px Barlow`, { align: 'right' }), '#bdbdbd', 0.4, 0.5, 0);
  return sf;
}

// Height map → tangent-space normal map (OpenGL convention; canvas y runs down, texture v runs up).
function normalMap(sf, strength) {
  const { Wpx: W, Hpx: H } = sf;
  const soft = document.createElement('canvas'); soft.width = W; soft.height = H;
  const sx = soft.getContext('2d');
  sx.filter = `blur(${Math.max(1, sf.S * 0.018).toFixed(2)}px)`;
  sx.drawImage(sf.height, 0, 0);
  const src = sx.getImageData(0, 0, W, H).data;
  const out = new ImageData(W, H), o = out.data;
  const k = strength / 255;
  for (let y = 0; y < H; y++) {
    const ym = Math.max(0, y - 1) * W, yp = Math.min(H - 1, y + 1) * W, y0 = y * W;
    for (let x = 0; x < W; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(W - 1, x + 1);
      const dx = (src[(y0 + xp) * 4] - src[(y0 + xm) * 4]) * k;
      const dy = (src[(yp + x) * 4] - src[(ym + x) * 4]) * k;
      const nx = -dx, ny = dy, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y0 + x) * 4;
      o[i] = (nx * inv * 0.5 + 0.5) * 255; o[i + 1] = (ny * inv * 0.5 + 0.5) * 255; o[i + 2] = (inv * 0.5 + 0.5) * 255; o[i + 3] = 255;
    }
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d').putImageData(out, 0, 0);
  return c;
}

function tex(canvas, renderer, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // anisotropic filtering returns garbage under SwiftShader (the software GPU the film renders on), so it stays off
  t.anisotropy = 1;
  t.needsUpdate = true;
  return t;
}

export function faceMaterial(sf, renderer, opts = {}) {
  const nrm = tex(normalMap(sf, opts.emboss ?? 1.6), renderer, false);
  const props = tex(sf.props, renderer, false);
  return new THREE.MeshPhysicalMaterial({
    map: tex(sf.color, renderer, true), roughnessMap: props, metalnessMap: props, normalMap: nrm,
    roughness: 1, metalness: 1, specularIntensity: 0.55, clearcoat: opts.clearcoat ?? 1, clearcoatRoughness: opts.coatRoughness ?? 0.04,
    clearcoatNormalMap: nrm, clearcoatNormalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1,
  });
}

// Fine brushing for metal: streaks along u, used as a roughness map (G channel).
export function brushedTexture(renderer, size = 1024, seed = 3, count = 2600) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(0,128,255)'; ctx.fillRect(0, 0, size, size);
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const y = r() * size, g = 90 + r() * 90;
    ctx.fillStyle = `rgba(0,${g | 0},255,${0.15 + r() * 0.35})`;
    ctx.fillRect(0, y, size, 0.6 + r() * 1.6);
  }
  const t = tex(c, renderer, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- body ----------
function outline(w, h, r, seg = 18) {
  const pts = [];
  const corners = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (Math.PI / 2) * k / seg;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) });
    }
  }
  return pts;
}

export function cardGeometry({ w, h, r, t, bevel: b } = CARD) {
  const ring = outline(w, h, r);
  const N = ring.length;
  // caps: inset by the bevel so the rounded edge wraps onto the faces
  const capPts = ring.map((p) => new THREE.Vector2(p.x - p.nx * b, p.y - p.ny * b));
  const tris = THREE.ShapeUtils.triangulateShape(capPts, []);
  const cap = (z, sign, mirror) => {
    const g = new THREE.BufferGeometry();
    const pos = [], nor = [], uv = [], idx = [];
    for (const p of capPts) {
      pos.push(p.x, p.y, z); nor.push(0, 0, sign);
      const u = (p.x + w / 2) / w;
      uv.push(mirror ? 1 - u : u, (p.y + h / 2) / h);
    }
    for (const [a, bb, c] of tris) sign > 0 ? idx.push(a, bb, c) : idx.push(a, c, bb);
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  const front = cap(t / 2, 1, false), back = cap(-t / 2, -1, true);

  // edge: front fillet → flat wall → back fillet
  const prof = [];
  const K = 6;
  for (let k = 0; k <= K; k++) { const f = (Math.PI / 2) * k / K; prof.push([-b + b * Math.sin(f), t / 2 - b + b * Math.cos(f), Math.sin(f), Math.cos(f)]); }
  for (let k = 0; k <= K; k++) { const f = Math.PI / 2 + (Math.PI / 2) * k / K; prof.push([-b + b * Math.sin(f), -t / 2 + b + b * Math.cos(f), Math.sin(f), Math.cos(f)]); }
  const pos = [], nor = [], uv = [], idx = [];
  let len = 0;
  for (let i = 0; i <= N; i++) {
    const p = ring[i % N];
    if (i > 0) { const q = ring[i - 1]; len += Math.hypot(p.x - q.x, p.y - q.y); }
    prof.forEach(([d, z, sr, sz], k) => {
      pos.push(p.x + p.nx * d, p.y + p.ny * d, z);
      nor.push(p.nx * sr, p.ny * sr, sz);
      uv.push(len * 6, k / (prof.length - 1));
    });
  }
  const P = prof.length;
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < P - 1; k++) {
      const a = i * P + k, b2 = (i + 1) * P + k;
      idx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
    }
  }
  const edge = new THREE.BufferGeometry();
  edge.setIndex(idx);
  edge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  edge.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  edge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return { front, back, edge };
}

// ---------- chip ----------
// Contact plate in millimetres, centred, y up. Six pads: three on the left, a centre bar joined to the top-right pad, two on the right.
export function chipPads({ w = 10.8, h = 8.6, g = 0.26, ch = 0.8, r = 0.32 } = {}) {
  const X0 = -w / 2, X1 = w / 2, Y0 = -h / 2, Y1 = h / 2;
  const c0 = [X0, -1.95], c1 = [-1.95 + g, 1.55], c2 = [1.55 + g, X1];
  const r0 = [1.55, Y1], r1 = [-1.45, 1.55 - g], r2 = [Y0, -1.45 - g];
  const rc = 0.22;
  return [
    fillet([[c0[0], r0[0]], [c0[1], r0[0]], [c0[1], r0[1]], [X0 + ch, Y1, rc], [X0, Y1 - ch, rc]], r),
    fillet([[c0[0], r1[0]], [c0[1], r1[0]], [c0[1], r1[1]], [c0[0], r1[1]]], r),
    fillet([[X0, Y0 + ch, rc], [X0 + ch, Y0, rc], [c0[1], Y0], [c0[1], r2[1]], [c0[0], r2[1]]], r),
    fillet([[c1[0], Y0], [c1[1], Y0], [c1[1], r0[0]], [X1, r0[0]], [X1, Y1 - ch, rc], [X1 - ch, Y1, rc], [c1[0], Y1]], r),
    fillet([[c2[0], r1[0]], [X1, r1[0]], [X1, r1[1]], [c2[0], r1[1]]], r),
    fillet([[c2[0], Y0], [X1 - ch, Y0, rc], [X1, Y0 + ch, rc], [X1, r2[1]], [c2[0], r2[1]]], r),
  ];
}

export function chipOutline({ w = 10.8, h = 8.6, ch = 0.8 } = {}) {
  return fillet([[-w / 2 + ch, -h / 2], [w / 2 - ch, -h / 2], [w / 2, -h / 2 + ch], [w / 2, h / 2 - ch], [w / 2 - ch, h / 2], [-w / 2 + ch, h / 2], [-w / 2, h / 2 - ch], [-w / 2, -h / 2 + ch]], 0.22);
}

export function padGeometries({ depth = 0.14, bevel = 0.05, ...opts } = {}) {
  return chipPads(opts).map((pts) => {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, curveSegments: 8,
    });
    geo.computeVertexNormals();
    return geo;
  });
}

export function makeChip(renderer, { padMaterial, scale = 0.1, depth = 0.14 } = {}) {
  const group = new THREE.Group();
  const mat = padMaterial || chipMaterial(renderer);
  for (const geo of padGeometries({ depth })) group.add(new THREE.Mesh(geo, mat));
  const baseShape = new THREE.Shape(chipOutline().map(([x, y]) => new THREE.Vector2(x, y)));
  const baseGeo = new THREE.ExtrudeGeometry(baseShape, { depth: depth * 0.5, bevelEnabled: false, curveSegments: 8 });
  const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, metalness: 0.6, roughness: 0.5 }));
  baseMesh.position.z = -0.01;
  group.add(baseMesh);
  group.scale.setScalar(scale);
  return group;
}

export function chipMaterial(renderer) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.62, 0.62, 0.64), metalness: 1, roughness: 0.46,
    roughnessMap: brushedTexture(renderer), anisotropy: 0.6, anisotropyRotation: 0,
  });
}

export function copperMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.96, 0.56, 0.40), metalness: 1, roughness: 0.22 });
}

export function hblMesh({ cap = 1, depth = 0.02, bevel = 0.01, material } = {}) {
  const geo = new THREE.ExtrudeGeometry(hblShapes(), {
    depth: depth / cap, bevelEnabled: bevel > 0, bevelThickness: bevel / cap, bevelSize: bevel / cap, bevelOffset: -bevel / cap,
    bevelSegments: 4, curveSegments: 10,
  });
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material || copperMaterial());
  m.scale.set(cap, cap, cap);
  return m;
}

// The finished card: body, both faces, chip and copper wordmark. Faces are shared between copies.
export function makeCard(renderer, faces) {
  const { w, h, t } = CARD;
  const geo = faces.geo || (faces.geo = cardGeometry());
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo.front, faces.front));
  group.add(new THREE.Mesh(geo.back, faces.back));
  group.add(new THREE.Mesh(geo.edge, faces.edge));
  // chip, flush with the face
  const chip = makeChip(renderer, { padMaterial: faces.chip, depth: 0.14 });
  const C = FRONT.chip;
  chip.position.set(-w / 2 + C.x * 0.1, h / 2 - C.y * 0.1, t / 2 - 0.004);
  group.add(chip);
  // copper wordmark, raised a hair off the face
  const L = FRONT.logo;
  const logo = hblMesh({ cap: L.cap * 0.1, depth: 0.0035, bevel: 0.0025, material: faces.copper });
  logo.position.set(-w / 2 + L.x * 0.1, h / 2 - (L.top + L.cap) * 0.1, t / 2 - 0.0005);
  group.add(logo);
  group.userData = { chip, logo };
  return group;
}

export function makeFaces(renderer, opts = {}) {
  const front = faceMaterial(frontArtwork(opts.frontPx || 6144, opts), renderer, opts);
  const back = faceMaterial(backArtwork(opts.backPx || 4096), renderer, opts);
  const edge = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.62, 0.62, 0.64), metalness: 1, roughness: 0.3,
    roughnessMap: brushedTexture(renderer, 512, 9), anisotropy: 0.6,
  });
  return { front, back, edge, chip: chipMaterial(renderer), copper: copperMaterial() };
}
