// Chess Bot 1
import { Chess, type Move } from 'chess.js';
import { Engine, type InfoLine } from '@/panel/engine';
import { winPct } from '@/panel/notation';

export interface Candidate {
  uci: string;
  san: string;
  loss: number;
  shallow: number;
  hidden: boolean;
  bonus: number;
}

export interface Choice {
  uci: string;
  san: string;
  /** Verzögerung bis zum Zug (ms). */
  think: number;
  why: 'einziger' | 'klar' | 'wahl' | 'abweichung';
  candidates: Candidate[];
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

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

  constructor(url: string) {
    this.engine = new Engine(url);
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

    const early = game.moveNumber() <= 4;
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
    const candidates: Candidate[] = deep.map((l) => {
      const uci = l.pv[0]!;
      const m = legal.find((x) => x.lan === uci)!;
      const loss = bestDeep - winPct(l.score);
      const g = shallowBy.has(uci) ? bestShallow - shallowBy.get(uci)! : 30;
      return {
        uci,
        san: m?.san ?? uci,
        loss,
        shallow: g,
        hidden: g >= 8 && g - loss >= 8,
        bonus: m ? bonus(game, m, last, own) : 0,
      };
    });

    const pick = (c: Candidate, why: Choice['why']): Choice => ({
      uci: c.uci,
      san: c.san,
      think: thinkTime(c, candidates, early, random),
      why,
      candidates,
    });

    const best = candidates[0]!;
    const second = candidates[1];
    if (!best.hidden && (!second || second.loss >= 6) && random() < 0.88) return pick(best, 'klar');

    if (game.moveNumber() > 8 && random() < 0.07) {
      const alt = candidates.filter((c) => c.loss > 4 && c.loss <= 20 && !c.hidden && c.bonus >= 0);
      if (alt.length) return pick(sample(alt, (c) => Math.exp(c.bonus * 0.6), random), 'abweichung');
    }
    const book = game.moveNumber() <= 8;
    let pool = candidates.filter((c) => c.loss <= (book ? 5 : 12) && !c.hidden);
    if (!pool.length) {
      const visible = candidates.filter((c) => !c.hidden && c.loss <= 15);
      pool = visible.length ? [visible[0]!] : [best];
    }
    const [natW, lossW] = book ? [0.9, 0.5] : [0.6, 0.2];
    return pick(sample(pool, (c) => Math.exp(c.bonus * natW - c.loss * lossW), random), 'wahl');
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
