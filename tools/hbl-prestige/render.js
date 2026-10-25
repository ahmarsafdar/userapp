// usage: node render.js <outdir> <fps> <from> <to>          renders frames [from, to) into outdir/%05d.jpg
//        node render.js <outdir> preview <t1> <t2> ...      renders those timestamps as outdir/t_<t>.jpg
// Options through the environment: SHOT=<name> builds only that shot (faster previews), SIZE=WxH.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const [outdir, mode, ...rest] = process.argv.slice(2);
const root = __dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.json': 'application/json' };

// ES modules need http(s), so the page is served from a tiny local server.
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  const [w, h] = (process.env.SIZE || '1920x1080').split('x').map(Number);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('CONSOLE', m.text().slice(0, 300)); });
  const q = new URLSearchParams({ w, h, ...(process.env.SHOT ? { shot: process.env.SHOT } : {}) });
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${port}/${process.env.PAGE || 'film.html'}?${q}`);
  await p.waitForFunction(() => window.ready, null, { timeout: 600000 });
  console.error(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  fs.mkdirSync(outdir, { recursive: true });

  const jobs = mode === 'preview'
    ? rest.map((t) => ({ t: +t, name: `t_${(+t).toFixed(2)}.jpg` }))
    : Array.from({ length: +rest[1] - +rest[0] }, (_, k) => { const i = +rest[0] + k; return { t: i / +mode, name: `${String(i).padStart(5, '0')}.jpg` }; });
  const t1 = Date.now();
  for (const job of jobs) {
    const data = await p.evaluate((t) => { window.renderFrame(t); return document.querySelector('canvas').toDataURL('image/jpeg', 0.95); }, job.t);
    fs.writeFileSync(path.join(outdir, job.name), Buffer.from(data.split(',')[1], 'base64'));
  }
  console.error(`rendered ${jobs.length} frames in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  await b.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
