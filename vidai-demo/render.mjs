// Renders the film frame by frame with headless Chromium.
//   node render.mjs                      full render to out/frames + out/vidai-demo.mp4
//   node render.mjs --stills 0.5,6,11    single frames to out/stills for review
//   node render.mjs --from 9 --to 14     render part of the timeline
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Playwright may be installed globally (CommonJS require resolves NODE_PATH; ESM import does not)
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const FPS = 30;
const SHUTTER = 0.6; // fraction of a frame interval covered by motion-blur sub-frames
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(url);
await page.evaluate(() => window.ready);
const duration = await page.evaluate(() => window.DURATION);

async function shot(t, file) {
  await page.evaluate(tt => window.renderAt(tt), t);
  await page.screenshot({ path: file, type: 'jpeg', quality: 94, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
}

const stills = opt('--stills');
if (stills) {
  const dir = path.join(ROOT, 'out/stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of stills.split(',')) {
    const t = parseFloat(s);
    await shot(t, path.join(dir, `t${t.toFixed(2).padStart(6, '0')}.jpg`));
  }
  console.log('stills ->', dir);
} else {
  const from = parseFloat(opt('--from', '0')), to = parseFloat(opt('--to', String(duration)));
  const dir = path.join(ROOT, 'out/frames'), sub = path.join(ROOT, 'out/sub');
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(sub, { recursive: true });
  const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
  const blurJobs = [];
  const t0 = Date.now();
  for (let f = f0; f < f1; f++) {
    const t = f / FPS;
    const out = path.join(dir, `f${String(f).padStart(5, '0')}.jpg`);
    const n = await page.evaluate(tt => window.samplesAt(tt), t);
    if (n <= 1) { await shot(t, out); continue; }
    const parts = [];
    for (let k = 0; k < n; k++) {
      const tt = t + (k / (n - 1) - 0.5) * (SHUTTER / FPS);
      const p = path.join(sub, `f${String(f).padStart(5, '0')}_${k}.jpg`);
      await shot(tt, p); parts.push(p);
    }
    blurJobs.push({ out, parts });
    if (f % 30 === 0) console.log(`frame ${f}/${f1} ${(Date.now() - t0) / 1000}s`);
  }
  console.log(`captured ${f1 - f0} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s; blending ${blurJobs.length} motion-blur frames`);
  fs.writeFileSync(path.join(ROOT, 'out/blur-jobs.json'), JSON.stringify(blurJobs));
  const r = spawnSync('python3', ['-I', path.join(ROOT, 'tools/blend.py'), path.join(ROOT, 'out/blur-jobs.json')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}
await browser.close();
server.close();
