// Nachrichten zwischen Inhalts-Skript (liest das Brett, zeichnet Pfeile)
// und Panel (rechnet mit Stockfish, zeigt die Oberfläche).
import type { Color } from './board';

export type SourceId = 'chess.com' | 'lichess' | 'chessground' | 'chessboard.js' | 'bild';

export interface BoardRead {
  /** Platzierungsteil der FEN. */
  placement: string;
  /** Farbe, die unten steht. */
  orientation: Color;
  /** Hervorgehobene Felder des letzten Zugs (falls die Seite sie zeigt). */
  lastMove: string[];
  source: SourceId;
  /** Analysebrett (beide Seiten „du“) statt Partie gegen jemanden. */
  analysis: boolean;
  /** Zugseite, falls die Seite sie verrät (z. B. ein FEN-Feld). */
  turn?: Color;
}

export type ArrowKind = 'best' | 'alt' | 'piece' | 'threat' | 'opponent' | 'preview';
export type Tone = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface OverlayArrow {
  from: string;
  to: string;
  kind: ArrowKind;
  /** 0–1, steuert Deckkraft und Breite. */
  weight: number;
  /** Zug noch nicht fest (Stockfish rechnet): blass und gestrichelt. */
  pending?: boolean;
}

export interface OverlayModel {
  arrows: OverlayArrow[];
  focus: { square: string; kind: 'best' | 'piece' | 'opponent' }[];
  badge: { square: string; glyph: string; tone: Tone } | null;
  scale: number;
  dark: boolean;
}

export type ToPanel =
  | { type: 'board'; read: BoardRead }
  | { type: 'no-board' }
  | { type: 'select'; square: string | null }
  | { type: 'host'; host: string; path: string }
  | { type: 'vision'; state: VisionState }
  | { type: 'move-result'; ok: boolean; stale: boolean };

export type VisionState =
  | { phase: 'off' }
  | { phase: 'searching' }
  | { phase: 'marking' }
  | { phase: 'scanning'; learned: boolean }
  | { phase: 'error'; message: string };

export type ToContent =
  | { type: 'ready' }
  | { type: 'overlay'; overlay: OverlayModel }
  | { type: 'size'; width: number; height: number }
  | { type: 'drag'; phase: 'start' | 'move' | 'end'; screenX: number; screenY: number }
  | { type: 'close' }
  | { type: 'play'; from: string; to: string; promotion: boolean; before: string; after: string }
  | { type: 'newgame' }
  | { type: 'vision'; action: 'mark' | 'stop' | 'learn' | 'forget' };
