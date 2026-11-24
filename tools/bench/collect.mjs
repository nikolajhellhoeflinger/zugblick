// Sammelt echte Brett-Bildschirmfotos mit bekannter Stellung (ohne Erweiterung).
import { chromium } from 'playwright';
import fs from 'node:fs';

const FENS = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  'r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1 b - - 0 9',
  'r2q1rk1/1b2bppp/p2p1n2/npp1p3/3PP3/2P2N1P/PPBN1PP1/R1BQR1K1 w - - 2 13',
  '2r2rk1/pp3ppp/2n1pn2/q2p4/3P4/P1PBPN2/5PPP/R2Q1RK1 b - - 0 15',
  '8/5pk1/6p1/1p5p/1P1R3P/r5P1/5PK1/8 w - - 0 40',
  '6k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1',
  'r3k2r/ppp2ppp/2nqbn2/3pp3/2B1P1b1/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 0 8',
  '4k3/1P6/8/8/8/8/6p1/4K3 w - - 0 1',
  'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
];
const which = process.argv[2] || 'lichess';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: Number(process.env.DPR || 1),
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
let n = 0;
for (const [i, fen] of FENS.entries()) {
  for (const color of ['white', 'black']) {
    if (color === 'black' && i % 3 !== 1) continue;
    let url, sel;
    if (which === 'lichess') {
      url = `https://lichess.org/analysis/standard/${fen.replace(/ /g, '_')}?color=${color}`;
      sel = 'cg-board';
    } else {
      url = `https://www.chess.com/analysis?fen=${encodeURIComponent(fen)}&flip=${color === 'black'}`;
      sel = 'wc-chess-board';
    }
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(which === 'lichess' ? 2500 : 5000);
    for (let k = 0; k < 6; k++) {
      let clicked = false;
      for (const name of [/^Reject All$/, /^Alle ablehnen$/, /^Ok$/, /^Got it$/]) {
        const b = page.getByRole('button', { name });
        if (await b.count()) { await b.first().click({ timeout: 2000 }).catch(() => {}); clicked = true; }
      }
      if (!clicked) break;
      await page.waitForTimeout(700);
    }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
    if (which !== 'lichess' && color === 'black') {
      // chess.com: Brett drehen per Taste f (falls URL-Parameter nicht greift)
      const flipped = await page.evaluate(() => document.querySelector('wc-chess-board')?.classList.contains('flipped'));
      if (!flipped) { await page.locator('wc-chess-board').first().click({ position: { x: 5, y: 5 } }).catch(() => {}); await page.keyboard.press('f'); await page.waitForTimeout(800); }
    }
    const box = await page.locator(sel).first().boundingBox();
    const orient = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (s === 'cg-board') return el.closest('.cg-wrap').classList.contains('orientation-black') ? 'b' : 'w';
      return el.classList.contains('flipped') ? 'b' : 'w';
    }, sel);
    const name = `${which}-${String(n++).padStart(2, '0')}`;
    await page.screenshot({ path: `tools/bench/samples/${name}.png` });
    fs.writeFileSync(`tools/bench/samples/${name}.json`, JSON.stringify({ fen, rect: box, orient, dpr: Number(process.env.DPR || 1) }));
    console.log(name, orient, fen.split(' ')[0]);
  }
}
await browser.close();
