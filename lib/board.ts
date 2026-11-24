// Gemeinsame Brett-Grundlagen für Inhalts-Skript und Panel.
// Feld-Index: a1 = 0, b1 = 1 … h8 = 63 (Index = Reihe * 8 + Linie).

export type Color = 'w' | 'b';
export type PieceCode = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export type Placement = (PieceCode | null)[];

export const FILES = 'abcdefgh';

export function squareName(index: number): string {
  return FILES[index % 8]! + (Math.floor(index / 8) + 1);
}

export function squareIndex(name: string): number {
  const file = FILES.indexOf(name[0] ?? '');
  const rank = Number(name[1]) - 1;
  if (file < 0 || rank < 0 || rank > 7) return -1;
  return rank * 8 + file;
}

export function emptyPlacement(): Placement {
  return new Array<PieceCode | null>(64).fill(null);
}

export function pieceColor(p: PieceCode): Color {
  return p === p.toUpperCase() ? 'w' : 'b';
}

/** Platzierungsteil einer FEN, z. B. „rnbqkbnr/pppppppp/8/…“. */
export function placementToFen(p: Placement): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const piece = p[rank * 8 + file];
      if (piece) {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      } else empty++;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

export function fenToPlacement(fen: string): Placement {
  const p = emptyPlacement();
  const rows = fen.split(' ')[0]!.split('/');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) file += Number(ch);
      else {
        p[rank * 8 + file] = ch as PieceCode;
        file++;
      }
    }
  });
  return p;
}

export const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

/** Grobe Plausibilität: je ein König, höchstens 16 Steine, keine Bauern auf Reihe 1/8. */
export function placementLooksValid(p: Placement): boolean {
  let wk = 0;
  let bk = 0;
  let w = 0;
  let b = 0;
  let wp = 0;
  let bp = 0;
  for (let i = 0; i < 64; i++) {
    const piece = p[i];
    if (!piece) continue;
    if (piece === 'K') wk++;
    if (piece === 'k') bk++;
    if (piece === 'P') wp++;
    if (piece === 'p') bp++;
    if (pieceColor(piece) === 'w') w++;
    else b++;
    if ((piece === 'P' || piece === 'p') && (i < 8 || i >= 56)) return false;
  }
  return wk === 1 && bk === 1 && w <= 16 && b <= 16 && wp <= 8 && bp <= 8;
}
