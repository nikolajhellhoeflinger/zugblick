// Bilderkennung eines Schachbretts aus Pixeln – ohne KI-Modell, rein geometrisch:
// 1. Hintergrund je Feld aus dem Randstreifen schätzen (erkennt auch Hervorhebungen)
// 2. Flutfüllung vom Feldrand: was nicht erreicht wird, ist Figur (auch weiße Figur auf hellem Feld)
// 3. Farbe aus der Helligkeit im Inneren, Figurenart aus dem Umriss (Vorlagen)
import type { PieceCode } from '@/lib/board';

export const S = 40; // Pixel je Feld im normierten Brettbild
export const SIZE = S * 8;
export const N = 20; // Kantenlänge der normierten Umrissmaske
/** Stellschrauben (von der Messbank verändert). */
export const config = { edge: 999, tScale: 0.42 };
const DARK = 110;

export type Kind = 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
export const KINDS: Kind[] = ['k', 'q', 'r', 'b', 'n', 'p'];

export interface Shape {
  kind: Kind;
  /** N×N, 0–1 */
  mask: number[];
  /** Höhe relativ zur höchsten Figur auf dem Brett */
  relH: number;
  /** Breite / Höhe */
  ar: number;
}

export interface TemplateSet {
  learned: boolean;
  shapes: Shape[];
}

export interface RawSquare {
  occupied: boolean;
  luma: number;
  white: boolean;
  h: number;
  w: number;
  relH: number;
  ar: number;
  mask: Float32Array | null;
  highlight: boolean;
  /** Anteil verdeckter Pixel (eigene Pfeile) im Feldinneren */
  occlusion: number;
  /** Anteil dunkler Pixel der Figur (schwarze Figuren sind innen dunkel gefüllt) */
  dark: number;
}

export interface Scan {
  squares: RawSquare[]; // Bildschirm-Reihenfolge: Zeile * 8 + Spalte, oben links zuerst
  kinds: (Kind | null)[];
  orientation: 'w' | 'b';
  placement: (PieceCode | null)[]; // a1 = 0
  highlights: number[]; // a1-Index
  start: 'w' | 'b' | null; // Grundstellung erkannt, Farbe unten
  occupied: number;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1]!;
}

function dist(a: number[], b: number[]) {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

/** Rohanalyse aller 64 Felder. `px`: SIZE×SIZE RGBA, `ignore`: SIZE×SIZE (1 = Pixel nicht verwenden). */
export function analyze(px: Uint8ClampedArray, ignore?: Uint8Array | null): RawSquare[] {
  // 1. Hintergrund je Feld
  const bgs: number[][] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const d = Math.min(x, y, S - 1 - x, S - 1 - y);
          if (d < 1 || d > 4) continue;
          const gx = col * S + x;
          const gy = row * S + y;
          const i = gy * SIZE + gx;
          if (ignore?.[i]) continue;
          rs.push(px[i * 4]!);
          gs.push(px[i * 4 + 1]!);
          bs.push(px[i * 4 + 2]!);
        }
      }
      bgs.push([median(rs), median(gs), median(bs)]);
    }
  }
  const light = [0, 1, 2].map((ch) => median(bgs.filter((_, i) => ((i >> 3) + (i & 7)) % 2 === 0).map((b) => b[ch]!)));
  const dark = [0, 1, 2].map((ch) => median(bgs.filter((_, i) => ((i >> 3) + (i & 7)) % 2 === 1).map((b) => b[ch]!)));
  const contrast = dist(light, dark);
  const T = Math.max(26, Math.min(58, contrast * config.tScale));

  // Helligkeitskanten: Die Flutfüllung darf sie nicht überqueren (dünne Umrisse bei kleinen Brettern).
  const L = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) L[i] = lum(px[i * 4]!, px[i * 4 + 1]!, px[i * 4 + 2]!);
  // Nur innerhalb eines Feldes und mit Abstand zum Feldrand – die Grenze hell/dunkel ist keine Figur.
  const edge = new Uint8Array(SIZE * SIZE);
  for (let y = 1; y < SIZE - 1; y++) {
    const ly = y % S;
    if (ly < 3 || ly > S - 4) continue;
    for (let x = 1; x < SIZE - 1; x++) {
      const lx = x % S;
      if (lx < 3 || lx > S - 4) continue;
      const i = y * SIZE + x;
      const g = Math.max(Math.abs(L[i + 1]! - L[i - 1]!), Math.abs(L[i + SIZE]! - L[i - SIZE]!));
      if (g > config.edge) edge[i] = 1;
    }
  }

  const out: RawSquare[] = [];
  const visited = new Uint8Array(S * S);
  const queue = new Int32Array(S * S);
  const comp = new Int32Array(S * S);

  for (let sq = 0; sq < 64; sq++) {
    const row = sq >> 3;
    const col = sq & 7;
    const bg = bgs[sq]!;
    const base = (row + col) % 2 === 0 ? light : dark;
    const highlight = dist(bg, base) > Math.max(22, contrast * 0.22);
    let occ = 0;
    if (ignore) {
      for (let y = 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) occ += ignore[(row * S + y) * SIZE + col * S + x]!;
      occ /= (S - 6) * (S - 6);
    }
    visited.fill(0);
    const pix = (x: number, y: number) => ((row * S + y) * SIZE + col * S + x);
    const isBg = (x: number, y: number) => {
      const i = pix(x, y);
      if (ignore?.[i] || edge[i]) return false;
      return Math.hypot(px[i * 4]! - bg[0]!, px[i * 4 + 1]! - bg[1]!, px[i * 4 + 2]! - bg[2]!) < T;
    };
    // 2. Flutfüllung vom Rand
    let qh = 0;
    let qt = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const d = Math.min(x, y, S - 1 - x, S - 1 - y);
        if (d > 2) continue;
        const k = y * S + x;
        if (!visited[k] && isBg(x, y)) {
          visited[k] = 1;
          queue[qt++] = k;
        }
      }
    }
    while (qh < qt) {
      const k = queue[qh++]!;
      const x = k % S;
      const y = (k / S) | 0;
      const nb = [k - 1, k + 1, k - S, k + S];
      const ok = [x > 0, x < S - 1, y > 0, y < S - 1];
      for (let j = 0; j < 4; j++) {
        if (!ok[j]) continue;
        const n = nb[j]!;
        if (visited[n]) continue;
        if (isBg(n % S, (n / S) | 0)) {
          visited[n] = 1;
          queue[qt++] = n;
        }
      }
    }
    // Figur = nicht erreicht, nicht ignoriert, nicht ganz am Rand → größte zusammenhängende Fläche
    comp.fill(0);
    let bestId = 0;
    let bestSize = 0;
    let id = 0;
    for (let y = 2; y < S - 2; y++) {
      for (let x = 2; x < S - 2; x++) {
        const k = y * S + x;
        if (visited[k] || comp[k] || ignore?.[pix(x, y)]) continue;
        id++;
        let size = 0;
        qh = 0;
        qt = 0;
        queue[qt++] = k;
        comp[k] = id;
        while (qh < qt) {
          const c = queue[qh++]!;
          size++;
          const cx = c % S;
          const cy = (c / S) | 0;
          const nb = [c - 1, c + 1, c - S, c + S];
          const ok = [cx > 2, cx < S - 3, cy > 2, cy < S - 3];
          for (let j = 0; j < 4; j++) {
            if (!ok[j]) continue;
            const n = nb[j]!;
            if (visited[n] || comp[n] || ignore?.[pix(n % S, (n / S) | 0)]) continue;
            comp[n] = id;
            queue[qt++] = n;
          }
        }
        if (size > bestSize) {
          bestSize = size;
          bestId = id;
        }
      }
    }
    let x0 = S;
    let y0 = S;
    let x1 = -1;
    let y1 = -1;
    if (bestId) {
      for (let k = 0; k < S * S; k++) {
        if (comp[k] !== bestId) continue;
        const x = k % S;
        const y = (k / S) | 0;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    const h = y1 - y0 + 1;
    const w = x1 - x0 + 1;
    const occupied = bestSize >= S * S * 0.06 && h >= S * 0.3 && w >= S * 0.2;
    if (!occupied) {
      out.push({ occupied: false, luma: 0, white: false, h: 0, w: 0, relH: 0, ar: 0, mask: null, highlight, occlusion: occ, dark: 0 });
      continue;
    }
    // Farbe: Helligkeit im Inneren (Umrisslinie abgezogen)
    let sum = 0;
    let cnt = 0;
    let sumAll = 0;
    let cntAll = 0;
    let darkCnt = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const k = y * S + x;
        if (comp[k] !== bestId) continue;
        const i = pix(x, y);
        const r = px[i * 4]!;
        const gg = px[i * 4 + 1]!;
        const b = px[i * 4 + 2]!;
        // Kräftig farbige Pixel (fremde Pfeile, Markierungen) verfälschen die Figurenfarbe.
        if (Math.max(r, gg, b) - Math.min(r, gg, b) > 70) continue;
        const l = lum(r, gg, b);
        sumAll += l;
        cntAll++;
        if (l < DARK) darkCnt++;
        const inner =
          x > 1 && y > 1 && x < S - 2 && y < S - 2 &&
          comp[k - 2] === bestId && comp[k + 2] === bestId && comp[k - 2 * S] === bestId && comp[k + 2 * S] === bestId;
        if (inner) {
          sum += l;
          cnt++;
        }
      }
    }
    const luma = cnt > 12 ? sum / cnt : sumAll / Math.max(1, cntAll);
    // Normierte Umrissmaske N×N
    const mask = new Float32Array(N * N);
    for (let ty = 0; ty < N; ty++) {
      for (let tx = 0; tx < N; tx++) {
        const sx0 = x0 + (tx * w) / N;
        const sx1 = x0 + ((tx + 1) * w) / N;
        const sy0 = y0 + (ty * h) / N;
        const sy1 = y0 + ((ty + 1) * h) / N;
        let hit = 0;
        let tot = 0;
        for (let y = Math.floor(sy0); y < Math.max(Math.floor(sy0) + 1, Math.ceil(sy1)); y++) {
          for (let x = Math.floor(sx0); x < Math.max(Math.floor(sx0) + 1, Math.ceil(sx1)); x++) {
            tot++;
            if (comp[y * S + x] === bestId) hit++;
          }
        }
        mask[ty * N + tx] = tot ? hit / tot : 0;
      }
    }
    out.push({ occupied: true, luma, white: false, h, w, relH: 0, ar: w / h, mask, highlight, occlusion: occ, dark: cntAll ? darkCnt / cntAll : 0 });
  }

  // Farbe: schwarze Figuren sind innen dunkel gefüllt, weiße haben höchstens einen dunklen Umriss.
  // Kombiniert aus Dunkel-Anteil und Helligkeit; die Schwelle liegt in der Lücke der Messbank.
  const occ = out.filter((s) => s.occupied);
  if (occ.length) {
    for (const q of occ) q.white = q.dark * 100 - 0.5 * (q.luma - 128) < 64;
    const maxH = Math.max(...occ.map((s) => s.h));
    occ.forEach((s) => (s.relH = s.h / maxH));
  }
  return out;
}

function shapeDistance(sq: RawSquare, t: Shape, learned: boolean): number {
  const m = sq.mask!;
  let inter = 0;
  let uni = 0;
  for (let i = 0; i < N * N; i++) {
    const a = m[i]!;
    const b = t.mask[i]!;
    inter += Math.min(a, b);
    uni += Math.max(a, b);
  }
  const iou = uni ? inter / uni : 0;
  const hW = learned ? 2.2 : 1.1;
  return 1 - iou + hW * Math.abs(sq.relH - t.relH) + 0.6 * Math.abs(sq.ar - t.ar);
}

/** Grundstellung? Reihen 0,1,6,7 voll, Mitte leer, oben eine Farbe, unten die andere. */
export function detectStart(squares: RawSquare[]): 'w' | 'b' | null {
  for (let i = 0; i < 64; i++) {
    const row = i >> 3;
    const should = row <= 1 || row >= 6;
    if (squares[i]!.occupied !== should) return null;
  }
  const top = squares.slice(0, 16);
  const bottom = squares.slice(48);
  const topWhite = top.filter((s) => s.white).length;
  const bottomWhite = bottom.filter((s) => s.white).length;
  if (bottomWhite === 16 && topWhite === 0) return 'w';
  if (topWhite === 16 && bottomWhite === 0) return 'b';
  return null;
}

const BACK_W: Kind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

/** Lernt die Figurenformen aus einer erkannten Grundstellung. */
export function learn(squares: RawSquare[], bottom: 'w' | 'b'): TemplateSet {
  const back = bottom === 'w' ? BACK_W : [...BACK_W].reverse();
  const groups = new Map<Kind, RawSquare[]>();
  const add = (k: Kind, s: RawSquare) => {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  };
  for (let col = 0; col < 8; col++) {
    add(back[col]!, squares[col]!);
    add('p', squares[8 + col]!);
    add('p', squares[48 + col]!);
    add(back[col]!, squares[56 + col]!);
  }
  const shapes: Shape[] = [];
  for (const [kind, list] of groups) {
    const mask = new Array(N * N).fill(0);
    for (const s of list) for (let i = 0; i < N * N; i++) mask[i] += s.mask![i]! / list.length;
    shapes.push({
      kind,
      mask: mask.map((v) => Math.round(v * 100) / 100),
      relH: list.reduce((t, s) => t + s.relH, 0) / list.length,
      ar: list.reduce((t, s) => t + s.ar, 0) / list.length,
    });
  }
  return { learned: true, shapes };
}

/** Figurenarten bestimmen und mit Schachregeln gerade ziehen (je ein König, keine Bauern am Rand). */
export interface Prior {
  kinds: (Kind | null)[];
  white: boolean[];
}

/**
 * `prior`: letzte sichere Lesung. Verdeckte Felder (eigener Pfeil darüber), auf denen weiter
 * eine Figur derselben Farbe steht, behalten ihre Figur – der Umriss ist dort nicht verlässlich.
 */
export function classify(squares: RawSquare[], templates: TemplateSet[], prior?: Prior | null): Scan {
  const learned = templates.find((t) => t.learned);
  const use = learned ? [learned] : templates;
  const scores: (Record<Kind, number> | null)[] = squares.map((sq) => {
    if (!sq.occupied || !sq.mask) return null;
    const best = {} as Record<Kind, number>;
    for (const k of KINDS) best[k] = Infinity;
    for (const set of use) {
      for (const t of set.shapes) {
        const d = shapeDistance(sq, t, set.learned);
        if (d < best[t.kind]) best[t.kind] = d;
      }
    }
    return best;
  });
  const kinds: (Kind | null)[] = scores.map((sc, i) => {
    if (!sc) return null;
    const sq = squares[i]!;
    const before = prior?.kinds[i];
    if (before && sq.occlusion > 0.04 && prior!.white[i] === sq.white) return before;
    return KINDS.reduce((a, b) => (sc[a] <= sc[b] ? a : b));
  });

  const second = (i: number, exclude: Kind[]): Kind => {
    const sc = scores[i]!;
    return KINDS.filter((k) => !exclude.includes(k)).reduce((a, b) => (sc[a] <= sc[b] ? a : b));
  };

  // Je Farbe genau ein König
  for (const white of [true, false]) {
    const idx = squares.map((s, i) => (s.occupied && s.white === white ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const kings = idx.filter((i) => kinds[i] === 'k');
    let keep = -1;
    if (kings.length >= 1) keep = kings.reduce((a, b) => (scores[a]!.k <= scores[b]!.k ? a : b));
    else keep = idx.reduce((a, b) => (scores[a]!.k - Math.min(...Object.values(scores[a]!)) <= scores[b]!.k - Math.min(...Object.values(scores[b]!)) ? a : b));
    for (const i of idx) {
      if (i === keep) kinds[i] = 'k';
      else if (kinds[i] === 'k') kinds[i] = second(i, ['k']);
    }
  }

  // Ausrichtung: Wo steht der weiße König?
  const wk = kinds.findIndex((k, i) => k === 'k' && squares[i]!.white);
  const bk = kinds.findIndex((k, i) => k === 'k' && !squares[i]!.white);
  let orientation: 'w' | 'b' = 'w';
  if (wk >= 0 && bk >= 0 && wk >> 3 !== bk >> 3) orientation = wk >> 3 > bk >> 3 ? 'w' : 'b';
  else {
    let wRows = 0;
    let wCount = 0;
    let bRows = 0;
    let bCount = 0;
    squares.forEach((s, i) => {
      if (!s.occupied) return;
      if (s.white) {
        wRows += i >> 3;
        wCount++;
      } else {
        bRows += i >> 3;
        bCount++;
      }
    });
    if (wCount && bCount) orientation = wRows / wCount >= bRows / bCount ? 'w' : 'b';
  }

  const toIndex = (screen: number) => {
    const row = screen >> 3;
    const col = screen & 7;
    return orientation === 'w' ? (7 - row) * 8 + col : row * 8 + (7 - col);
  };

  // Keine Bauern auf der ersten/letzten Reihe
  squares.forEach((s, i) => {
    if (kinds[i] !== 'p') return;
    const rank = toIndex(i) >> 3;
    if (rank === 0 || rank === 7) kinds[i] = second(i, ['p', 'k']);
  });

  const placement: (PieceCode | null)[] = new Array(64).fill(null);
  const highlights: number[] = [];
  squares.forEach((s, i) => {
    const idx = toIndex(i);
    if (s.highlight) highlights.push(idx);
    const k = kinds[i];
    if (!k) return;
    placement[idx] = (s.white ? k.toUpperCase() : k) as PieceCode;
  });

  return {
    squares,
    kinds,
    orientation,
    placement,
    highlights,
    start: detectStart(squares),
    occupied: squares.filter((s) => s.occupied).length,
  };
}

// ---------- Brett im Bildschirmfoto finden ----------

export interface Rect {
  x: number;
  y: number;
  size: number;
}

/** Wie stark sieht dieses Quadrat nach Schachbrett aus? (helle/dunkle Felder im Wechsel) */
export function gridScore(L: Float32Array, W: number, H: number, x: number, y: number, size: number, inset: number): number {
  if (x < 0 || y < 0 || x + size > W || y + size > H || size < 64) return -Infinity;
  const sq = size / 8;
  let sl = 0;
  let sl2 = 0;
  let sd = 0;
  let sd2 = 0;
  const v = [0, 0, 0, 0];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const xa = Math.floor(x + (c + inset) * sq);
      const xb = Math.floor(x + (c + 1 - inset) * sq);
      const ya = Math.floor(y + (r + inset) * sq);
      const yb = Math.floor(y + (r + 1 - inset) * sq);
      v[0] = L[ya * W + xa]!;
      v[1] = L[ya * W + xb]!;
      v[2] = L[yb * W + xa]!;
      v[3] = L[yb * W + xb]!;
      v.sort((a, b) => a - b);
      const m = (v[1]! + v[2]!) / 2;
      if ((r + c) % 2 === 0) {
        sl += m;
        sl2 += m * m;
      } else {
        sd += m;
        sd2 += m * m;
      }
    }
  }
  const ml = sl / 32;
  const md = sd / 32;
  const vl = Math.sqrt(Math.max(0, sl2 / 32 - ml * ml));
  const vd = Math.sqrt(Math.max(0, sd2 / 32 - md * md));
  return (ml - md) / (vl + vd + 4);
}

/** Feinjustage um ein Rechteck herum (zwei Stufen: grob, dann pixelgenau). */
export function refine(L: Float32Array, W: number, H: number, r: Rect, radius = 0.05): Rect & { score: number } {
  let best = { ...r, score: gridScore(L, W, H, r.x, r.y, r.size, 0.12) };
  const pass = (rad: number, step: number, inset: number) => {
    const c = { ...best };
    let bestScore = gridScore(L, W, H, c.x, c.y, c.size, inset);
    for (let ds = -rad; ds <= rad; ds += step) {
      for (let dy = -rad; dy <= rad; dy += step) {
        for (let dx = -rad; dx <= rad; dx += step) {
          const s = gridScore(L, W, H, Math.round(c.x + dx), Math.round(c.y + dy), Math.round(c.size + ds), inset);
          if (s > bestScore) {
            bestScore = s;
            best = { x: Math.round(c.x + dx), y: Math.round(c.y + dy), size: Math.round(c.size + ds), score: s };
          }
        }
      }
    }
    best.score = bestScore;
  };
  const rad = Math.max(2, Math.round(r.size * radius));
  pass(rad, Math.max(1, Math.round(rad / 8)), 0.12);
  const fine = Math.max(2, Math.round(r.size * 0.012));
  pass(fine, 1, 0.05);
  best.score = gridScore(L, W, H, best.x, best.y, best.size, 0.12);
  return best;
}

/** Grobe Suche in einem Bereich (z. B. in einem Video). */
export function searchArea(L: Float32Array, W: number, H: number, area: { x: number; y: number; w: number; h: number }, budgetMs = 700): (Rect & { score: number }) | null {
  const t0 = performance.now();
  const maxSize = Math.min(area.w, area.h);
  const minSize = Math.max(96, maxSize * 0.3);
  let best: (Rect & { score: number }) | null = null;
  const sizeStep = Math.max(4, Math.round(maxSize / 40));
  for (let size = maxSize; size >= minSize; size -= sizeStep) {
    const step = Math.max(3, Math.round(size / 24));
    for (let y = area.y; y + size <= area.y + area.h; y += step) {
      for (let x = area.x; x + size <= area.x + area.w; x += step) {
        const s = gridScore(L, W, H, x, y, size, 0.18);
        if (!best || s > best.score) best = { x, y, size, score: s };
      }
    }
    if (performance.now() - t0 > budgetMs) break;
  }
  return best ? refine(L, W, H, best, 0.08) : null;
}

export function toLuma(data: Uint8ClampedArray, W: number, H: number): Float32Array {
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = lum(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  return L;
}
