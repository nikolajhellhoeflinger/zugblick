// Erzeugt die Erweiterungs-Symbole (Springer im Sucherrahmen) als PNG.
import { chromium } from 'playwright';
import fs from 'node:fs';
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
  <rect x="0.5" y="0.5" width="23" height="23" rx="5.5" fill="#12151b"/>
  <path d="M4.6 8.4V4.6h3.8M15.6 4.6h3.8v3.8M19.4 15.6v3.8h-3.8M8.4 19.4H4.6v-3.8" fill="none" stroke="#5b8cff" stroke-width="1.9" stroke-linecap="square"/>
  <path d="M9.2 17.6h6.6c.2-3.1-.4-5.4-1.7-7.2-.9-1.3-2.2-2.2-3.6-2.6l-.4-1.3-.9 1.5c-1 .6-2 1.6-2.6 2.8l-.9 1.6c-.3.5.1 1.1.7 1.1l1.6-.2c.4 0 .9-.3 1.1-.6l.6-.8c.3 1.2 0 2.4-.8 3.5-.6.8-.5 1.6.3 2.2z" fill="#eef0f3" transform="translate(12 12) scale(.78) translate(-12 -12.4)"/>
</svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 96, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  await page.screenshot({ path: `public/icon/${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
fs.writeFileSync('tools/icon.svg', svg(128));
await browser.close();
console.log('ok');
