// Zug auf der Seite ausführen: Klick auf Start- und Zielfeld, aber nur, wenn die Stellung
// genau so aussieht, wie der Zug berechnet wurde. Jeder Schritt wird nachgeprüft.
// Reine Logik ohne DOM – deshalb mit einem Fake-Brett testbar (tests/mover.test.ts).

export interface MoverIO {
  /** Klickt ein Feld. false, wenn dort kein Ziel gefunden wird. */
  click(square: string): boolean;
  /** Platzierung, wie die Seite sie gerade zeigt (null = nicht lesbar). */
  placement(): string | null;
  sleep(ms: number): Promise<void>;
}

export interface MoveJob {
  from: string;
  to: string;
  promotion: boolean;
  /** Platzierung VOR dem Zug – so muss die Seite aussehen, sonst wird nichts geklickt. */
  before: string;
  /** Platzierung NACH dem Zug (Dame bei Umwandlung). */
  after: string;
}

export type MoveOutcome = 'ok' | 'stale' | 'failed';

const jitter = (a: number, b: number) => a + Math.random() * (b - a);

async function waitFor(io: MoverIO, want: string, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (io.placement() === want) return true;
    await io.sleep(100);
  }
  return io.placement() === want;
}

/**
 * Ablauf:
 * 1. Seite muss zwei Mal hintereinander exakt `before` zeigen (sonst: stale, nichts klicken).
 * 2. Startfeld klicken, dann Zielfeld. Ergebnis muss `after` sein (sonst: failed).
 * 3. Schlägt der Zug fehl, wird das Startfeld noch einmal geklickt, damit die Auswahl wieder weg ist.
 *    Die Seite bleibt so, wie sie vorher war – nichts wird ungewollt gezogen.
 */
export async function executeMove(io: MoverIO, job: MoveJob): Promise<MoveOutcome> {
  // 1. Stabil prüfen
  let seen = 0;
  for (let i = 0; i < 20 && seen < 2; i++) {
    seen = io.placement() === job.before ? seen + 1 : 0;
    if (seen < 2) await io.sleep(120);
  }
  if (seen < 2) return 'stale';

  // 2. Startfeld
  await io.sleep(jitter(200, 420));
  if (!io.click(job.from)) return 'failed';
  await io.sleep(jitter(220, 420));
  if (io.placement() !== job.before) return 'stale'; // Seite hat sich während des Klicks geändert

  // 3. Zielfeld
  if (!io.click(job.to)) return cancel(io, job);
  if (await waitFor(io, job.after, 1800)) return 'ok';

  // Umwandlung: Auswahl mit der Dame ist ein zweiter Klick auf das Zielfeld
  if (job.promotion) {
    await io.sleep(jitter(300, 500));
    io.click(job.to);
    if (await waitFor(io, job.after, 1500)) return 'ok';
  }
  return cancel(io, job);
}

/** Zurück in den Ausgangszustand: Auswahl aufheben, nur wenn die Seite noch vor dem Zug steht. */
async function cancel(io: MoverIO, job: MoveJob): Promise<MoveOutcome> {
  await io.sleep(jitter(150, 300));
  if (io.placement() === job.before) io.click(job.from);
  return 'failed';
}
