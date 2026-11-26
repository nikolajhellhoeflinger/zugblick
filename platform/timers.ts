// Timer für das Panel der Chrome-Erweiterung, die Chrome im Hintergrund-Tab nicht drosselt.
// Normale Timer laufen dort höchstens einmal pro Sekunde, nach 5 Minuten nur noch etwa einmal pro Minute –
// Autospielen würde stehen. Diese hier zählen in einem eigenen Worker (worker-timers, MIT) und wecken das Panel
// per Nachricht; Nachrichten drosselt Chrome nicht.
// Nur das Panel importiert diese Datei. Userscript und Website ersetzen sie durch `timers-plain.ts`.
import { wrap } from 'worker-timers-broker';
import TimerWorker from 'worker-timers-worker?worker';
import type { Timers } from './types';

type Broker = ReturnType<typeof wrap>;
let broker: Broker | null | undefined;

/** Worker erst beim ersten Timer starten; klappt das nicht, normale Timer (lieber gedrosselt als gar nicht). */
function get(): Broker | null {
  if (broker === undefined) {
    try {
      broker = wrap(new TimerWorker());
    } catch {
      broker = null;
    }
  }
  return broker;
}

// Eigene Nummern (ab 1), damit 0 immer „kein Timer“ heißt.
let next = 0;
const live = new Map<number, { id: number; worker: boolean; repeat: boolean }>();

function start(fn: () => void, ms: number, repeat: boolean): number {
  const own = ++next;
  const b = get();
  const run = () => {
    if (!repeat) live.delete(own);
    fn();
  };
  if (b) {
    try {
      const id = repeat ? b.setInterval(run, ms) : b.setTimeout(run, ms);
      live.set(own, { id, worker: true, repeat });
      return own;
    } catch {
      /* Worker weg – normale Timer */
    }
  }
  const id = repeat ? window.setInterval(run, ms) : window.setTimeout(run, ms);
  live.set(own, { id, worker: false, repeat });
  return own;
}

function stop(own: number) {
  const t = live.get(own);
  if (!t) return;
  live.delete(own);
  try {
    if (t.worker) (t.repeat ? broker!.clearInterval : broker!.clearTimeout)(t.id);
    else (t.repeat ? window.clearInterval : window.clearTimeout)(t.id);
  } catch {
    /* schon abgelaufen */
  }
}

export const timers: Timers = {
  setTimeout: (fn, ms) => start(fn, ms, false),
  setInterval: (fn, ms) => start(fn, ms, true),
  clearTimeout: stop,
  clearInterval: stop,
};
