// Brett-Leser für bekannte Schach-Oberflächen. Jeder Leser findet das Brett
// im Seiten-HTML und baut daraus die Stellung – ohne Bilderkennung, exakt.
import {
  emptyPlacement,
  placementToFen,
  squareName,
  type Color,
  type PieceCode,
} from '@/lib/board';
import type { BoardRead, SourceId } from '@/lib/protocol';

export interface BoardAdapter {
  id: SourceId;
  /** Größtes sichtbares Brett dieser Bauart, sonst null. */
  find(min?: number): Element | null;
  /** null = Brett gerade in Bewegung (Animation, Ziehen) – später erneut lesen. */
  read(el: Element): BoardRead | null;
  /** Fläche der 64 Felder im Viewport. */
  rect(el: Element): DOMRect;
}

function largestVisible(nodes: Iterable<Element>, min = 120): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width < min || r.height < min) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const area = r.width * r.height;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

const ROLE: Record<string, string> = {
  king: 'k',
  queen: 'q',
  rook: 'r',
  bishop: 'b',
  knight: 'n',
  pawn: 'p',
};

function isAnalysisPath(): boolean {
  return /analy|editor|study|studie|explorer|learn/i.test(location.pathname);
}

// chess.com: <wc-chess-board> mit <div class="piece wp square-52">
const chessCom: BoardAdapter = {
  id: 'chess.com',
  find(min) {
    return largestVisible(document.querySelectorAll('wc-chess-board, chess-board'), min);
  },
  read(el) {
    const p = emptyPlacement();
    for (const node of Array.from(el.querySelectorAll('.piece'))) {
      let code = '';
      let sq = -1;
      let dragging = false;
      for (const cls of Array.from(node.classList)) {
        const m = /^([wb])([pnbrqk])$/.exec(cls);
        if (m) code = m[1] === 'w' ? m[2]!.toUpperCase() : m[2]!;
        const s = /^square-(\d)(\d)$/.exec(cls);
        if (s) sq = (Number(s[2]) - 1) * 8 + (Number(s[1]) - 1);
        if (cls === 'dragging') dragging = true;
      }
      if (dragging) return null;
      if (code && sq >= 0 && sq < 64) p[sq] = code as PieceCode;
    }
    const highlights: string[] = [];
    for (const node of Array.from(el.querySelectorAll('.highlight'))) {
      for (const cls of Array.from(node.classList)) {
        const s = /^square-(\d)(\d)$/.exec(cls);
        if (s) highlights.push(squareName((Number(s[2]) - 1) * 8 + (Number(s[1]) - 1)));
      }
    }
    return {
      placement: placementToFen(p),
      orientation: el.classList.contains('flipped') ? 'b' : 'w',
      lastMove: highlights,
      source: 'chess.com',
      analysis: isAnalysisPath(),
    };
  },
  rect(el) {
    return el.getBoundingClientRect();
  },
};

// chessground (lichess und viele andere): <cg-board><piece class="white pawn" style="transform: translate(…)">
function parseTranslate(style: string): [number, number] | null {
  const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(style);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function chessgroundAdapter(id: SourceId): BoardAdapter {
  return {
    id,
    find(min) {
      return largestVisible(document.querySelectorAll('cg-board'), min);
    },
    read(el) {
      const size = (el as HTMLElement).clientWidth / 8;
      if (!size) return null;
      const wrap = el.closest('.cg-wrap');
      const orientation: Color = wrap?.classList.contains('orientation-black') ? 'b' : 'w';
      const toIndex = (x: number, y: number) => {
        let file = Math.round(x / size);
        let row = Math.round(y / size);
        if (file < 0 || file > 7 || row < 0 || row > 7) return -1;
        if (orientation === 'w') return (7 - row) * 8 + file;
        return row * 8 + (7 - file);
      };
      const p = emptyPlacement();
      for (const node of Array.from(el.querySelectorAll('piece'))) {
        const cls = node.classList;
        if (cls.contains('ghost') || cls.contains('fading')) continue;
        if (cls.contains('dragging') || cls.contains('anim')) return null;
        const color = cls.contains('white') ? 'w' : cls.contains('black') ? 'b' : '';
        let role = '';
        for (const c of Array.from(cls)) if (ROLE[c]) role = ROLE[c]!;
        if (!color || !role) continue;
        const t = parseTranslate((node as HTMLElement).style.transform);
        if (!t) continue;
        const idx = toIndex(t[0], t[1]);
        if (idx < 0) continue;
        p[idx] = (color === 'w' ? role.toUpperCase() : role) as PieceCode;
      }
      const lastMove: string[] = [];
      for (const node of Array.from(el.querySelectorAll('square.last-move'))) {
        const t = parseTranslate((node as HTMLElement).style.transform);
        if (!t) continue;
        const idx = toIndex(t[0], t[1]);
        if (idx >= 0) lastMove.push(squareName(idx));
      }
      return {
        placement: placementToFen(p),
        orientation,
        lastMove,
        source: id,
        analysis: isAnalysisPath(),
      };
    },
    rect(el) {
      return el.getBoundingClientRect();
    },
  };
}

// chessboard.js (viele kleine Seiten und Tutorials): .square-55d63[data-square] > img[data-piece="wP"]
const chessboardJs: BoardAdapter = {
  id: 'chessboard.js',
  find(min) {
    return largestVisible(document.querySelectorAll('.board-b72b1'), min);
  },
  read(el) {
    const squares = el.querySelectorAll('[data-square]');
    if (squares.length < 64) return null;
    const p = emptyPlacement();
    for (const sq of Array.from(squares)) {
      const name = sq.getAttribute('data-square') ?? '';
      const img = sq.querySelector('[data-piece]');
      const code = img?.getAttribute('data-piece') ?? '';
      const file = 'abcdefgh'.indexOf(name[0] ?? '');
      const rank = Number(name[1]) - 1;
      if (file < 0 || !(rank >= 0) || !/^[wb][KQRBNP]$/.test(code)) continue;
      p[rank * 8 + file] = (code[0] === 'w' ? code[1] : code[1]!.toLowerCase()) as PieceCode;
    }
    const first = squares[0]?.getAttribute('data-square');
    return {
      placement: placementToFen(p),
      orientation: first === 'h1' ? 'b' : 'w',
      lastMove: [],
      source: 'chessboard.js',
      analysis: true,
    };
  },
  rect(el) {
    return el.getBoundingClientRect();
  },
};

/** `min`: kleinste Kantenlänge in px – fürs automatische Öffnen nur echte Bretter, keine Vorschaubilder. */
export function pickAdapter(min = 120): { adapter: BoardAdapter; el: Element } | null {
  const host = location.hostname;
  const order: BoardAdapter[] = host.endsWith('chess.com')
    ? [chessCom, chessgroundAdapter('chessground'), chessboardJs]
    : host.endsWith('lichess.org')
      ? [chessgroundAdapter('lichess'), chessCom, chessboardJs]
      : [chessgroundAdapter('chessground'), chessCom, chessboardJs];
  for (const adapter of order) {
    const el = adapter.find(min);
    if (el) return { adapter, el };
  }
  return null;
}
