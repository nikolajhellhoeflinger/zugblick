// Erzeugt die eingebauten Umriss-Vorlagen aus freien Figurensätzen (tools/piecesets).
// Jeder Satz wird als Grundstellung auf ein künstliches Brett gezeichnet und durch
// dieselbe Erkennung geschickt wie im Browser – so passen Vorlagen und Laufzeit exakt.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const sets = fs.readdirSync('tools/piecesets').filter((d) => !d.startsWith('.'));
const bundle = fs.readFileSync('tools/.cache/recognize.js', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c" width="320" height="320"></canvas>');
await page.addScriptTag({ content: bundle });

const out = [];
for (const set of sets) {
  const svgs = {};
  for (const f of fs.readdirSync(path.join('tools/piecesets', set))) {
    svgs[f.replace('.svg', '')] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join('tools/piecesets', set, f)).toString('base64');
  }
  for (const colors of [['#f0d9b5', '#b58863'], ['#eeeed2', '#769656'], ['#dee3e6', '#8ca2ad']]) {
    const tpl = await page.evaluate(async ({ svgs, colors }) => {
      const c = document.getElementById('c');
      const g = c.getContext('2d');
      const S = 40;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        g.fillStyle = (r + f) % 2 === 0 ? colors[0] : colors[1];
        g.fillRect(f * S, r * S, S, S);
      }
      const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
      const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
      for (let f = 0; f < 8; f++) {
        const place = async (code, row) => g.drawImage(await load(svgs[code]), f * S, row * S, S, S);
        await place('b' + back[f], 0);
        await place('bP', 1);
        await place('wP', 6);
        await place('w' + back[f], 7);
      }
      const px = g.getImageData(0, 0, 320, 320).data;
      const raw = ZBR.analyze(px);
      const start = ZBR.detectStart(raw);
      if (start !== 'w') return { error: 'start ' + start + ' occ ' + raw.filter((s) => s.occupied).length };
      return ZBR.learn(raw, 'w');
    }, { svgs, colors });
    if (tpl.error) { console.log(set, colors[1], 'FEHLER', tpl.error); continue; }
    out.push({ learned: false, set, shapes: tpl.shapes });
    console.log(set, colors[1], 'ok');
    break; // ein Farbschema je Satz reicht, wenn es klappt
  }
}
fs.writeFileSync('content/vision-builtin.json', JSON.stringify(out));
console.log('geschrieben:', out.length, 'Sätze,', fs.statSync('content/vision-builtin.json').size, 'Bytes');
await browser.close();
