// Website „Gegen Zugblick spielen“ (GitHub Pages). Eigener Bau neben der Erweiterung:
// pnpm site:dev / pnpm site:build → site/dist
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/zugblick/',
  publicDir: fileURLToPath(new URL('../public', import.meta.url)),
  plugins: [tailwindcss()],
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': root.replace(/\/$/, '') } },
  build: { outDir: 'dist', emptyOutDir: true },
});
