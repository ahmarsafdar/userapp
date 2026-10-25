// usage: node render.js <outdir> <fps> <from> <to> [times...]
// renders frames [from, to) at fps into outdir/%05d.jpg; if times are given, renders those timestamps instead (preview)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const [outdir, fps, from, to, ...times] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text()); });
  await p.goto('file://' + path.join(__dirname, 'intro.html'));
  await p.evaluate(() => window.ready);
  const list = times.length ? times.map(Number) : null;
  const n = list ? list.length : (+to - +from);
  const t0 = Date.now();
  for (let k = 0; k < n; k++) {
    const i = list ? k : +from + k;
    const t = list ? list[k] : i / +fps;
    await p.evaluate((t) => window.renderFrame(t), t);
    const name = list ? `t_${t.toFixed(2)}.jpg` : `${String(i).padStart(5, '0')}.jpg`;
    await p.screenshot({ path: path.join(outdir, name), type: 'jpeg', quality: 94 });
  }
  console.error(`done ${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await b.close();
})();
