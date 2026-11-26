// Chess Bot 1
// Spielt immer etwas genauer als der Gegner und gewinnt: Ziel-Genauigkeit = Gegner + GAP, nie unter FLOOR.
// Accuracy wie im Panel – an chess.com angenähert (lib/accuracy.ts). Gewinnen geht immer vor der Accuracy.
import { Chess, type Move } from 'chess.js';
import { expectedPoints, gameAccuracy, lossForAccuracy, moveAccuracy } from '@/lib/accuracy';
import { Engine, type InfoLine, type Score } from '@/panel/engine';

/** Gewinnchance 0–100 auf derselben Kurve wie die Accuracy. */
const winPct = (score: Score) => 100 * expectedPoints(score);

export interface Candidate {
  uci: string;
  san: string;
  loss: number;
  shallow: number;
  hidden: boolean;
  bonus: number;
  /** Gewinnchance nach dem Zug (0–100, aus eigener Sicht). */
  win: number;
  /** Zug führt sofort zu Remis (Patt, Wiederholung, 50 Züge, zu wenig Material). */
  draw: boolean;
}

/** Wie der Bot diesen Zug angelegt hat – für Tests und Fehlersuche. */
export interface Plan {
  /** Bisherige Genauigkeit (null = noch zu wenig Züge bewertet). */
  own: number | null;
  opp: number | null;
  /** Abstand zum Gegner, der für diese Partie ausgelost wurde. */
  gap: number;
  /** Ziel für die eigene Genauigkeit am Partieende. */
  target: number;
  /** Erlaubter Verlust an Gewinnchance in diesem Zug. */
  budget: number;
  /** Mindest-Gewinnchance nach dem Zug. */
  need: number;
}

export interface Choice {
  uci: string;
  san: string;
  /** Verzögerung bis zum Zug (ms). */
  think: number;
  why: 'einziger' | 'klar' | 'wahl' | 'abweichung' | 'sicher';
  candidates: Candidate[];
  plan?: Plan;
}

/**
 * So viel genauer als der Gegner will der Bot sein – je Partie zufällig in dieser Spanne,
 * damit es nicht immer gleich aussieht. Mit der Streuung landet das Ergebnis zwischen +2 und +6 …
 */
export const GAP_MIN = 3;
export const GAP_MAX = 5;
/** … aber nie ungenauer als das. */
export const FLOOR = 80;
const CAP = 99;
/** Größter Verlust an Gewinnchance in einem Zug – darüber wäre es ein Patzer. */
const MAX_LOSS = 12;

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Stellung ohne Zugzähler – gleiche Stellung, gleicher Schlüssel. */
const posKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Partie aus dem Verlauf nachspielen (für Wiederholungs-Remis). Passt sie nicht zur Stellung: nur die Stellung. */
function replay(fen: string, history: Move[]): Chess {
  if (history.length) {
    try {
      const g = new Chess(history[0]!.before);
      for (const m of history) g.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (posKey(g.fen()) === posKey(fen)) return g;
    } catch {
      /* Verlauf passt nicht */
    }
  }
  return new Chess(fen);
}

function leadsToDraw(g: Chess, m: Move): boolean {
  try {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const draw = g.isDraw();
    g.undo();
    return draw;
  } catch {
    return false;
  }
}

/**
 * Eine Suche als Promise. Ergebnis: die Zeilen der tiefsten VOLLSTÄNDIG gerechneten Tiefe –
 * läuft die Zeit mitten in einer Tiefe ab, mischen sich sonst Tiefen, und Züge kommen doppelt vor.
 * Hängt Stockfish, endet die Suche nach `limit` ms mit dem, was bis dahin da ist.
 */
function search(engine: Engine, job: Parameters<Engine['search']>[0], limit: number): Promise<InfoLine[]> {
  const want = job.multipv ?? 1;
  const byDepth = new Map<number, Map<number, InfoLine>>();
  const result = () => {
    const depths = [...byDepth.keys()].sort((a, b) => b - a);
    const full = depths.find((d) => byDepth.get(d)!.size >= want) ?? depths[0];
    if (full == null) return [];
    const seen = new Set<string>();
    return [...byDepth.get(full)!.values()]
      .sort((a, b) => a.multipv - b.multipv)
      .filter((l) => !seen.has(l.pv[0]!) && seen.add(l.pv[0]!));
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      engine.stop();
      resolve(result());
    }, limit);
    engine.search({
      ...job,
      onInfo: (info) => {
        let m = byDepth.get(info.depth);
        if (!m) byDepth.set(info.depth, (m = new Map()));
        m.set(info.multipv, info);
      },
      onDone: () => {
        clearTimeout(timer);
        resolve(result());
      },
    });
  });
}

function rank(square: string) {
  return Number(square[1]);
}

export function bonus(game: Chess, m: Move, last: Move | null, own: Move | null = null): number {
  const opening = game.moveNumber() <= 12;
  const opp = m.color === 'w' ? 'b' : 'w';
  let n = 0;
  if (m.san.endsWith('#')) n += 6;
  if (last?.captured && m.captured && m.to === last.to) n += 3;
  else if (m.captured) n += 1 + Math.max(0, VALUE[m.captured]! - VALUE[m.piece]!) * 0.35;
  if (m.san.includes('+')) n += 0.8;
  if (m.isKingsideCastle() || m.isQueensideCastle()) n += 2;
  if (m.promotion) n += 2;
  const home = m.color === 'w' ? 1 : 8;
  if (opening && (m.piece === 'n' || m.piece === 'b') && rank(m.from) === home) n += 1.2;
  if (opening && m.piece === 'p' && 'de'.includes(m.from[0]!)) n += 0.8;
  if (opening && m.piece === 'p' && 'ah'.includes(m.from[0]!)) n -= 1.5;
  if (opening && m.piece === 'p' && m.from[0] === 'f' && game.moveNumber() <= 6) n -= 0.6;
  if (m.piece === 'n' && 'ah'.includes(m.to[0]!) && !m.captured) n -= 1;
  if (opening && m.piece === 'n' && ['c3', 'f3', 'c6', 'f6'].includes(m.to)) n += 0.6;
  if (m.piece === 'q' && game.moveNumber() <= 6 && !m.captured) n -= 0.8;
  const queens = game.findPiece({ type: 'q', color: 'w' }).length + game.findPiece({ type: 'q', color: 'b' }).length;
  if (m.piece === 'k' && !m.isKingsideCastle() && !m.isQueensideCastle() && queens > 0 && !game.inCheck()) n -= 1.2;
  const threatened = VALUE[m.piece]! >= 3 && game.isAttacked(m.from, opp);
  if (threatened && !m.captured) n += 1;
  if (opening && own && m.from === own.to && !m.captured && !threatened && m.piece !== 'p') n -= 1;
  const back = m.color === 'w' ? rank(m.from) - rank(m.to) : rank(m.to) - rank(m.from);
  if (back >= 3 && !threatened && !m.captured) n -= 1;
  return n;
}

export class ChessBot1 {
  private engine: Engine;
  private gen = 0;
  /** Bewertete Stellungen: Gewinnchance der Seite am Zug. Daraus rechnet der Bot die Genauigkeit beider Seiten. */
  private evals = new Map<string, { win: number; depth: number }>();
  /** Laufende Partie: woran sie erkannt wird und welcher Abstand für sie gilt. */
  private current = { start: '', plies: 0, gap: (GAP_MIN + GAP_MAX) / 2 };

  constructor(url: string) {
    this.engine = new Engine(url);
  }

  /** Abstand für diese Partie. Neue Partie (andere Ausgangsstellung, Verlauf kürzer geworden): neu auslosen. */
  private gapFor(history: Move[], random: () => number): number {
    const start = history.length ? posKey(history[0]!.before) : '';
    if (start !== this.current.start || history.length + 2 < this.current.plies) {
      this.current = { start, plies: history.length, gap: GAP_MIN + random() * (GAP_MAX - GAP_MIN) };
    }
    this.current.plies = history.length;
    return this.current.gap;
  }

  private remember(fen: string, win: number, depth: number) {
    const k = posKey(fen);
    const prev = this.evals.get(k);
    if (prev && prev.depth > depth) return;
    this.evals.delete(k);
    this.evals.set(k, { win, depth });
    if (this.evals.size > 6000) for (const old of [...this.evals.keys()].slice(0, 1000)) this.evals.delete(old);
  }

  /** Accuracy beider Seiten über die Züge, deren Stellung davor und danach bewertet ist (wie im Panel). */
  accuracy(history: Move[]): Record<'w' | 'b', { value: number | null; moves: number }> {
    const accs: Record<'w' | 'b', number[]> = { w: [], b: [] };
    for (const m of history) {
      const before = this.evals.get(posKey(m.before));
      const after = this.evals.get(posKey(m.after));
      if (!before || !after || this.forced(m.before)) continue;
      accs[m.color].push(moveAccuracy(Math.max(0, before.win - (100 - after.win)) / 100));
    }
    const of = (c: 'w' | 'b') => ({ value: gameAccuracy(accs[c]), moves: accs[c].length });
    return { w: of('w'), b: of('b') };
  }

  /** Nur ein legaler Zug? Solche Züge zählen nicht zur Accuracy. */
  private forcedCache = new Map<string, boolean>();
  private forced(fen: string): boolean {
    const k = posKey(fen);
    let f = this.forcedCache.get(k);
    if (f == null) {
      f = new Chess(fen).moves().length === 1;
      if (this.forcedCache.size > 6000) this.forcedCache.clear();
      this.forcedCache.set(k, f);
    }
    return f;
  }

  ready() {
    return this.engine.ready();
  }

  set onError(fn: ((msg: string) => void) | undefined) {
    this.engine.onError = fn;
  }

  /** Laufende Suche verwerfen (neue Partie). */
  cancel() {
    this.gen++;
    this.engine.stop();
  }

  /** `history` = bisherige Züge der Partie. */
  async choose(fen: string, history: Move[], random: () => number = Math.random): Promise<Choice | null> {
    const last = history[history.length - 1] ?? null;
    const own = history[history.length - 2] ?? null;
    const gen = ++this.gen;
    const game = new Chess(fen);
    const legal = game.moves({ verbose: true });
    if (!legal.length) return null;
    if (legal.length === 1) {
      const m = legal[0]!;
      return { uci: m.lan, san: m.san, think: 400 + random() * 500, why: 'einziger', candidates: [] };
    }

    const me = game.turn();
    const them = me === 'w' ? 'b' : 'w';
    const moveNo = game.moveNumber();
    const early = moveNo <= 4;
    const deep = await search(this.engine, { fen, multipv: Math.min(10, legal.length), movetime: early ? 500 : 900 }, 4000);
    if (gen !== this.gen) return null;
    if (!deep.length) {
      // Stockfish antwortet nicht: trotzdem ziehen.
      const m = legal.find((x) => x.captured) ?? legal[Math.floor(random() * legal.length)]!;
      return { uci: m.lan, san: m.san, think: 600, why: 'wahl', candidates: [] };
    }
    const ucis = deep.map((l) => l.pv[0]!);
    const shallow = await search(this.engine, { fen, multipv: ucis.length, depth: 4, searchmoves: ucis }, 2500);
    if (gen !== this.gen) return null;

    const shallowBy = new Map(shallow.map((l) => [l.pv[0]!, winPct(l.score)]));
    const bestDeep = Math.max(...deep.map((l) => winPct(l.score)));
    const bestShallow = Math.max(...shallow.map((l) => winPct(l.score)), 0);
    this.remember(fen, bestDeep, deep[0]!.depth);
    const full = replay(fen, history);
    const candidates: Candidate[] = deep.map((l) => {
      const uci = l.pv[0]!;
      const m = legal.find((x) => x.lan === uci);
      const win = winPct(l.score);
      if (m) this.remember(m.after, 100 - win, l.depth - 1);
      const loss = bestDeep - win;
      const g = shallowBy.has(uci) ? bestShallow - shallowBy.get(uci)! : 30;
      return {
        uci,
        san: m?.san ?? uci,
        loss,
        shallow: g,
        hidden: g >= 8 && g - loss >= 8,
        bonus: m ? bonus(game, m, last, own) : 0,
        win,
        draw: m ? leadsToDraw(full, m) : false,
      };
    });

    // Ziel: Genauigkeit des Gegners + Abstand dieser Partie, nie unter FLOOR. Ohne Daten (Partiebeginn) wie gegen einen guten Gegner.
    const acc = this.accuracy(history);
    const opp = acc[them].moves >= 2 ? acc[them].value : null;
    const mine = acc[me].value;
    const gap = this.gapFor(history, random);
    const target = clamp((opp ?? 88) + gap, FLOOR, CAP);
    // Tempomat: Abweichung vom Ziel über die nächsten Züge ausgleichen – je länger die Partie, desto kräftiger.
    const steer = mine == null ? 0 : ((target - mine) * Math.min(acc[me].moves, 30)) / 10;
    let budget = 100 * lossForAccuracy(clamp(target + steer, target - 30, 100));
    // Gewinn-Sperre: Mindest-Gewinnchance nach dem Zug, steigt mit der Partie.
    const need = moveNo <= 10 ? 40 : moveNo <= 18 ? 55 : moveNo <= 26 ? 65 : 72;
    const tight = bestDeep < need + 8;
    // Wird es eng, volle Kraft, bis der Vorsprung wieder da ist.
    if (tight) budget = Math.min(budget, 1.5);
    // Klar gewonnen und die Partie zieht sich: zügig zu Ende spielen.
    const halfmoves = Number(fen.split(' ')[4] ?? 0);
    if (bestDeep >= 97 && (moveNo >= 30 || halfmoves >= 20)) budget = Math.min(budget, 1.5);
    const plan: Plan = { own: mine, opp, gap, target, budget, need };

    const pick = (c: Candidate, why: Choice['why']): Choice => ({
      uci: c.uci,
      san: c.san,
      think: thinkTime(c, candidates, early, random),
      why,
      candidates,
      plan,
    });

    const ahead = bestDeep > 55;
    const playable = candidates.filter((c) => !(ahead && c.draw));
    const best = playable[0] ?? candidates[0]!;
    // Matt in Sicht: durchziehen.
    const mate = deep[0]!.score.mate;
    if (mate != null && mate > 0 && best === candidates[0]) return pick(best, 'sicher');

    const book = moveNo <= 8;
    const cap = Math.min(MAX_LOSS, budget + 1.5, book ? 5 : MAX_LOSS);
    const floorWin = Math.min(need, bestDeep - 1.5);
    let pool = playable.filter((c) => (tight || !c.hidden) && c.loss <= cap && c.win >= floorWin);
    if (!pool.length) pool = playable.filter((c) => c.loss <= 1.5);
    if (!pool.length) pool = [best];

    // Streuung um das Budget, im Schnitt genau das Budget; natürliche Züge bevorzugt.
    const aim = budget * (0.6 + random() * 0.8);
    const natW = book ? 0.9 : 0.6;
    const c = sample(pool, (x) => Math.exp(x.bonus * natW - Math.abs(x.loss - aim) * 0.45), random);
    return pick(c, c === candidates[0] ? (tight ? 'sicher' : 'klar') : c.loss > 4 ? 'abweichung' : 'wahl');
  }
}

/** Zufällig, aber gewichtet ziehen. */
function sample<T>(items: T[], weight: (t: T) => number, random: () => number): T {
  const w = items.map(weight);
  let r = random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= w[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[0]!;
}

function thinkTime(c: Candidate, all: Candidate[], early: boolean, random: () => number): number {
  if (early) return 400 + random() * 700;
  const close = all.filter((x) => x.loss <= 4).length;
  const obvious = c.bonus >= 3 || (all[1] && all[1].loss >= 12);
  if (obvious) return 500 + random() * 800;
  return 900 + Math.min(close, 5) * 300 + random() * 1400;
}
