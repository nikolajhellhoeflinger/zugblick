import { Chess, type Move } from 'chess.js';
import type { Color } from '@/lib/board';
import type { Score } from './engine';
import { t } from '@/lib/i18n';

export function load(fen: string): Chess | null {
  try {
    return new Chess(fen, { skipValidation: true });
  } catch {
    return null;
  }
}

export function uciParts(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

export function playUci(game: Chess, uci: string): Move | null {
  try {
    return game.move(uciParts(uci));
  } catch {
    return null;
  }
}

const sanCache = new Map<string, string[]>();

/** Hauptvariante als SAN, höchstens `max` Züge. */
export function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const key = `${fen}|${pv.slice(0, max).join(' ')}`;
  const hit = sanCache.get(key);
  if (hit) return hit;
  const game = load(fen);
  const out: string[] = [];
  if (game) {
    for (const uci of pv.slice(0, max)) {
      const m = playUci(game, uci);
      if (!m) break;
      out.push(m.san);
    }
  }
  if (sanCache.size > 4000) sanCache.clear();
  sanCache.set(key, out);
  return out;
}

export function moveFromUci(fen: string, uci: string): Move | null {
  const game = load(fen);
  return game ? playUci(game, uci) : null;
}

export function pieceName(p: string): string {
  const k = p.toLowerCase();
  return 'kqrbnp'.includes(k) && k ? t(`piece.${k}`) : '';
}

/** Zug in Worten, z. B. „Springer von g1 nach f3“. */
export function describe(m: Move): string {
  let text: string;
  if (m.san.startsWith('O-O-O')) text = t('move.castleLong');
  else if (m.san.startsWith('O-O')) text = t('move.castleShort');
  else {
    const piece = pieceName(m.piece);
    text = m.captured
      ? t('move.capture', { piece, from: m.from, captured: pieceName(m.captured), to: m.to })
      : t('move.go', { piece, from: m.from, to: m.to });
    if (m.promotion && 'qrbn'.includes(m.promotion)) text += t(`move.promote.${m.promotion}`);
  }
  if (m.san.endsWith('#')) text += t('move.mate');
  else if (m.san.endsWith('+')) text += t('move.check');
  return text;
}

/** Gewinnchance (0–100) aus Sicht dessen, für den der Score gilt (lichess-Formel). */
export function winPct(score: Score): number {
  if (score.mate != null) return score.mate > 0 ? 100 : score.mate < 0 ? 0 : 50;
  const cp = Math.max(-1500, Math.min(1500, score.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Score aus Sicht der ziehenden Seite → Sicht von Weiß. */
export function toWhite(score: Score, turn: Color): Score {
  if (turn === 'w') return score;
  return score.mate != null ? { mate: -score.mate } : { cp: -(score.cp ?? 0) };
}

export function formatScore(score: Score): string {
  if (score.mate != null) {
    if (score.mate === 0) return '#';
    return `${score.mate > 0 ? '+' : '−'}M${Math.abs(score.mate)}`;
  }
  const v = (score.cp ?? 0) / 100;
  if (Math.abs(v) < 0.005) return '0.00';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
}

export function formatNps(nps: number): string {
  if (nps >= 1e6) return `${(nps / 1e6).toFixed(1).replace('.', ',')} Mio/s`;
  if (nps >= 1e3) return `${Math.round(nps / 1e3)}k/s`;
  return `${nps}/s`;
}
