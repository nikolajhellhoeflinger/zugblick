// Normale Timer – für Userscript (Safari) und Website, wo es keinen Erweiterungs-Worker gibt.
// Ersetzt `platform/timers.ts` über die Aliase in scripts/build-userscript.mjs und site/vite.config.ts.
import type { Timers } from './types';

export const timers: Timers = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  clearInterval: (id) => window.clearInterval(id),
};
