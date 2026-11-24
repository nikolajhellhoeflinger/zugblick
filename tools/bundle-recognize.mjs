// Bündelt die Bilderkennung als Browser-Skript (window.ZBR) für Generator und Messbank.
import { build } from 'esbuild';
await build({
  entryPoints: ['content/recognize.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'ZBR',
  outfile: 'tools/.cache/recognize.js',
  alias: { '@': '.' },
  logLevel: 'warning',
});
console.log('ok');
