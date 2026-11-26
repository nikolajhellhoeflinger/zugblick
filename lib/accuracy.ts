// Accuracy wie chess.com – angenähert. chess.com hält seine Formel (CAPS2) geheim; diese hier ist an
// 891 öffentlichen chess.com-Partien mit veröffentlichter Accuracy eingestellt (Stand 26.11.2026, Stockfish 19
// lite, Tiefe 14) und an Spielern geprüft, die beim Einstellen nicht dabei waren: im Schnitt 4,8 Punkte
// daneben (die vorherige lichess-artige Formel lag 17,8 Punkte zu hoch).
//
// Ablauf: Bewertung → erwartete Punkte (0–1) → Verlust je Zug → Accuracy je Zug → Potenzmittel über die Partie.
// Züge ohne Alternative zählen nicht mit (das traf chess.com am besten).
import type { Score } from '@/panel/engine';

/** Steigung der erwarteten Punkte je Centipawn. */
const K = 0.0035455;
/** Wie streng ein Verlust zählt. */
const DECAY = 4.62153;
const OFFSET = 64.42207;
/** Potenzmittel: schlechte Züge ziehen die Partie stärker herunter als im normalen Schnitt. */
const POWER = 0.370304;

/** Erwartete Punkte (0–1) aus Sicht der Seite am Zug. Matt 0 heißt: die Seite am Zug ist matt. */
export function expectedPoints(score: Score): number {
  if (score.mate != null) return score.mate > 0 ? 1 : 0;
  const cp = Math.max(-1500, Math.min(1500, score.cp ?? 0));
  return 1 / (1 + Math.exp(-K * cp));
}

/**
 * Verlust an erwarteten Punkten durch einen Zug.
 * `before`: Bewertung vor dem Zug (Sicht des Ziehenden), `after`: danach (Sicht des Gegners, der dann am Zug ist).
 */
export function moveLoss(before: Score, after: Score): number {
  return Math.max(0, expectedPoints(before) - (1 - expectedPoints(after)));
}

/** Accuracy eines einzelnen Zugs (0–100) aus dem Verlust an erwarteten Punkten (0–1). */
export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, (100 + OFFSET) * Math.exp(-DECAY * loss) - OFFSET));
}

/** Umkehrung von `moveAccuracy`: Welcher Verlust ergibt diese Accuracy? */
export function lossForAccuracy(acc: number): number {
  if (acc >= 100) return 0;
  return Math.max(0, Math.log((Math.max(0, acc) + OFFSET) / (100 + OFFSET)) / -DECAY);
}

/** Accuracy einer Partie aus den Accuracies der einzelnen Züge (null = noch keine Züge). */
export function gameAccuracy(moves: number[]): number | null {
  if (!moves.length) return null;
  const s = moves.reduce((sum, a) => sum + Math.pow(Math.max(1, a) / 100, POWER), 0) / moves.length;
  return 100 * Math.pow(s, 1 / POWER);
}
