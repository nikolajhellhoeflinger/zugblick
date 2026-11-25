// Baut Zugblick als ein einziges Userscript (für Safari über die App „Userscripts“, auch iPhone).
// 1. Panel (React + CSS + Schriften) als ein Stück HTML.  2. Inhalts-Skript, das dieses HTML einbettet.
// Ergebnis: userscript/zugblick.user.js
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(root + 'package.json', 'utf8'));
const alias = [
  { find: /^@\/platform\/current$/, replacement: root + 'platform/userscript.ts' },
  { find: /^[@~]\//, replacement: root },
];
const common = {
  root,
  configFile: false,
  logLevel: 'warn',
  publicDir: false,
  resolve: { alias },
  define: { 'process.env.NODE_ENV': '"production"' },
};

// 1. Panel
await build({
  ...common,
  plugins: [tailwindcss()],
  define: { ...common.define, __ZB_PANEL_HTML__: '""' },
  build: {
    outDir: root + '.output/userscript-panel',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    lib: { entry: root + 'entrypoints/panel/main.tsx', formats: ['iife'], name: 'ZugblickPanel', fileName: () => 'panel.js', cssFileName: 'panel' },
  },
});
const out = root + '.output/userscript-panel/';
const js = readFileSync(out + 'panel.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(out + 'panel.css', 'utf8').replace(/<\/style/gi, '<\\/style');
const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zugblick</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`;

// 2. Inhalts-Skript
await build({
  ...common,
  define: { ...common.define, __ZB_PANEL_HTML__: JSON.stringify(html) },
  build: {
    outDir: root + '.output/userscript',
    emptyOutDir: true,
    lib: { entry: root + 'userscript/main.ts', formats: ['iife'], name: 'Zugblick', fileName: () => 'content.js' },
  },
});

const RAW = 'https://raw.githubusercontent.com/nikolajhellhoeflinger/zugblick/main/userscript/zugblick.user.js';
const header = `// ==UserScript==
// @name         Zugblick
// @namespace    https://github.com/nikolajhellhoeflinger/zugblick
// @version      ${pkg.version}
// @description  Stockfish in Echtzeit auf chess.com: zeigt den besten Zug für die Stellung, die du gerade siehst.
// @author       Zugblick
// @license      GPL-3.0-or-later
// @match        https://www.chess.com/*
// @match        https://chess.com/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        none
// @updateURL    ${RAW}
// @downloadURL  ${RAW}
// ==/UserScript==
`;
const body = readFileSync(root + '.output/userscript/content.js', 'utf8');
writeFileSync(root + 'userscript/zugblick.user.js', header + '\n' + body);
console.log(`userscript/zugblick.user.js  ${(Buffer.byteLength(header + body) / 1024).toFixed(0)} KB  v${pkg.version}`);
