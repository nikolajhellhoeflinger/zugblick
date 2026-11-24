// Messbank Bilderkennung: echte Bildschirmfotos → Erkennung → Vergleich mit der wahren Stellung.
// Aufruf: node tools/bench/run.mjs [präfix]   (vorher: node tools/bundle-recognize.mjs)
import { chromium } from 'playwright';
import fs from 'node:fs';

const prefix = process.argv[2] || '';
const dir = 'tools/bench/samples';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f.startsWith(prefix)).sort();
const builtin = JSON.parse(fs.readFileSync('content/vision-builtin.json', 'utf8'));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c" width="320" height="320"></canvas><canvas id="f"></canvas>');
await page.addScriptTag({ content: fs.readFileSync('tools/.cache/recognize.js', 'utf8') });

function fenToArr(fen) {
  const a = new Array(64).fill(null);
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) { if (/\d/.test(ch)) f += +ch; else { a[(7 - i) * 8 + f] = ch; f++; } }
  });
  return a;
}

const learnedBySite = {};
const shrinks = (process.env.SHRINK || '1').split(',').map(Number);
if (process.env.EDGE) await page.evaluate((e) => (ZBR.config.edge = e), Number(process.env.EDGE));
if (process.env.TS) await page.evaluate((e) => (ZBR.config.tScale = e), Number(process.env.TS));
let total = 0, okSq = 0, okBoards = 0, okOrient = 0;
const rows = [];
for (const shrink of shrinks) for (const f of files) {
  const meta = { ...JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8')), shrink };
  const site = f.split('-')[0];
  const png = 'data:image/png;base64,' + fs.readFileSync(`${dir}/${f.replace('.json', '.png')}`).toString('base64');
  const res = await page.evaluate(async ({ png, meta, builtin, learned }) => {
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = png; });
    const d = meta.dpr || 1;
    // ganzes Bild als Helligkeit für die Feinjustage
    const fc = document.getElementById('f');
    fc.width = img.width; fc.height = img.height;
    const fg = fc.getContext('2d', { willReadFrequently: true });
    fg.drawImage(img, 0, 0);
    const L = ZBR.toLuma(fg.getImageData(0, 0, img.width, img.height).data, img.width, img.height);
    const truth = { x: Math.round(meta.rect.x * d), y: Math.round(meta.rect.y * d), size: Math.round(meta.rect.width * d) };
    // absichtlich verschobener Start → Feinjustage muss zurückfinden
    const t0 = performance.now();
    const ref = ZBR.refine(L, img.width, img.height, { x: truth.x + Math.round(truth.size * 0.03), y: truth.y - Math.round(truth.size * 0.02), size: Math.round(truth.size * 0.97) });
    const refineMs = performance.now() - t0;
    const c = document.getElementById('c');
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    if (meta.shrink && meta.shrink !== 1) {
      // Kleineres Brett simulieren: erst auf Zielgröße, dann auf 320 px
      const t = Math.round(ref.size * meta.shrink);
      const tc = new OffscreenCanvas(t, t);
      const tg = tc.getContext('2d');
      tg.imageSmoothingQuality = 'high';
      tg.drawImage(img, ref.x, ref.y, ref.size, ref.size, 0, 0, t, t);
      g.drawImage(tc, 0, 0, t, t, 0, 0, 320, 320);
    } else g.drawImage(img, ref.x, ref.y, ref.size, ref.size, 0, 0, 320, 320);
    const px = g.getImageData(0, 0, 320, 320).data;
    const t1 = performance.now();
    const raw = ZBR.analyze(px);
    const sets = learned ? [learned] : builtin;
    const scan = ZBR.classify(raw, sets);
    const recMs = performance.now() - t1;
    const start = ZBR.detectStart(raw);
    const learnedNow = start ? ZBR.learn(raw, start) : null;
    const feats = raw.map((q, i) => q.occupied ? { i, luma: Math.round(q.luma), dark: Math.round(q.dark * 100) } : null);
    return { feats, placement: scan.placement, orientation: scan.orientation, start, learnedNow, refine: { dx: ref.x - truth.x, dy: ref.y - truth.y, ds: ref.size - truth.size, score: ref.score }, refineMs, recMs, occupied: scan.occupied };
  }, { png, meta, builtin, learned: process.env.LEARN === '1' ? learnedBySite[site] ?? null : null });
  if (res.learnedNow && !learnedBySite[site]) learnedBySite[site] = res.learnedNow;
  const truth = fenToArr(meta.fen);
  if (process.env.FEATS) {
    for (const ft of res.feats) {
      if (!ft) continue;
      const row = ft.i >> 3, col = ft.i & 7;
      const idx = meta.orient === 'w' ? (7 - row) * 8 + col : row * 8 + (7 - col);
      const t = truth[idx];
      if (!t) continue;
      (globalThis.FE ??= { w: [], b: [] })[t === t.toUpperCase() ? 'w' : 'b'].push(ft);
    }
  }
  let ok = 0;
  const wrong = [];
  for (let i = 0; i < 64; i++) {
    if ((truth[i] ?? '.') === (res.placement[i] ?? '.')) ok++;
    else wrong.push(`${'abcdefgh'[i % 8]}${(i >> 3) + 1}:${truth[i] ?? '.'}→${res.placement[i] ?? '.'}`);
  }
  total += 64; okSq += ok;
  if (ok === 64) okBoards++;
  if (res.orientation === meta.orient) okOrient++;
  rows.push(`${f.replace('.json', '')}@${shrink}  ${ok}/64  orient ${res.orientation === meta.orient ? 'ok' : 'FALSCH'}  refine(${res.refine.dx},${res.refine.dy},${res.refine.ds}) ${Math.round(res.refineMs)}ms rec ${Math.round(res.recMs)}ms  ${wrong.slice(0, 6).join(' ')}`);
}
console.log(rows.join('\n'));
const nb = files.length * shrinks.length;
if (globalThis.FE) {
  for (const c of ['w', 'b']) {
    const d = globalThis.FE[c].map((f) => f.dark).sort((a, b) => a - b);
    const l = globalThis.FE[c].map((f) => f.luma).sort((a, b) => a - b);
    const q = (a, p) => a[Math.floor((a.length - 1) * p)];
    console.log(`${c}: dark% min ${d[0]} p5 ${q(d, 0.05)} median ${q(d, 0.5)} p95 ${q(d, 0.95)} max ${d[d.length - 1]} · luma min ${l[0]} p5 ${q(l, 0.05)} median ${q(l, 0.5)} max ${l[l.length - 1]}`);
  }
}
console.log(`\nFelder richtig: ${okSq}/${total} (${((okSq / total) * 100).toFixed(1)} %) · Bretter fehlerfrei: ${okBoards}/${nb} · Ausrichtung richtig: ${okOrient}/${nb}`);
await browser.close();
