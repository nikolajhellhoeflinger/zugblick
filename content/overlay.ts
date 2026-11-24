// Zeichnet Pfeile, Sucherrahmen und Zugbewertung direkt über das Brett der Seite.
// Liegt in einem geschlossenen Shadow-DOM, fängt keine Klicks ab.
import { squareIndex, type Color } from '@/lib/board';
import type { OverlayArrow, OverlayModel, Tone } from '@/lib/protocol';

function setStyles(el: HTMLElement, styles: Record<string, string>) {
  for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important');
}

const COLORS = {
  best: '#2f6bff',
  piece: '#2f6bff',
  alt: '#2f6bff',
  preview: '#2f6bff',
  opponent: '#f2994a',
  threat: '#e5484d',
} as const;

const TONE: Record<Tone, string> = {
  best: '#2f6bff',
  good: '#3f9a6b',
  inaccuracy: '#d9a23a',
  mistake: '#e5772e',
  blunder: '#d93f3f',
};

const CSS = `
:host { all: initial; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.focus { transform-box: fill-box; transform-origin: center; animation: zb-focus 220ms cubic-bezier(.2,.8,.2,1); }
.badge { transform-box: fill-box; transform-origin: center; animation: zb-pop 260ms cubic-bezier(.2,.9,.3,1.3); }
@keyframes zb-focus { from { transform: scale(1.22); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes zb-pop { from { transform: scale(.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .focus, .badge { animation: none; } }
`;

/** Feld → Mittelpunkt in Brett-Einheiten (0–8), abhängig von der Blickrichtung. */
function center(square: string, orientation: Color): [number, number] {
  const i = squareIndex(square);
  const file = i % 8;
  const rank = Math.floor(i / 8);
  const x = orientation === 'w' ? file : 7 - file;
  const y = orientation === 'w' ? 7 - rank : rank;
  return [x + 0.5, y + 0.5];
}

interface ArrowGeo {
  d: string;
  head: [number, number][];
  width: number;
  color: string;
  opacity: number;
  dashed: boolean;
}

function arrowGeometry(a: OverlayArrow, orientation: Color, scale: number): ArrowGeo {
  const [x1, y1] = center(a.from, orientation);
  const [x2, y2] = center(a.to, orientation);
  const color = COLORS[a.kind];
  const primary = a.kind === 'best' || a.kind === 'piece' || a.kind === 'opponent' || a.kind === 'preview';
  const width = (primary ? 0.17 : 0.12) * scale * (0.75 + 0.25 * a.weight);
  const head = width * 2.6;
  const opacity = primary ? 0.92 : 0.25 + 0.45 * a.weight;
  const dashed = a.kind === 'threat';

  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
  // Springer: L-förmig, zuerst entlang der längeren Achse.
  const points: [number, number][] = knight
    ? dx > dy
      ? [[x1, y1], [x2, y1], [x2, y2]]
      : [[x1, y1], [x1, y2], [x2, y2]]
    : [[x1, y1], [x2, y2]];

  const [px, py] = points[points.length - 2]!;
  const len = Math.hypot(x2 - px, y2 - py);
  const ux = (x2 - px) / len;
  const uy = (y2 - py) / len;
  // Spitze endet knapp vor der Feldmitte, damit die Figur sichtbar bleibt.
  const tipX = x2 - ux * 0.12;
  const tipY = y2 - uy * 0.12;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  const shaft = [...points.slice(0, -1), [baseX, baseY] as [number, number]];
  const start = shaft[0]!;
  // Schaft beginnt etwas außerhalb der Startmitte.
  const sNext = shaft[1]!;
  const sl = Math.hypot(sNext[0] - start[0], sNext[1] - start[1]) || 1;
  start[0] += ((sNext[0] - start[0]) / sl) * 0.18;
  start[1] += ((sNext[1] - start[1]) / sl) * 0.18;
  const d = shaft.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(3)} ${pt[1].toFixed(3)}`).join(' ');
  const nx = -uy;
  const ny = ux;
  const hw = head * 0.62;
  return {
    d,
    head: [
      [tipX, tipY],
      [baseX + nx * hw, baseY + ny * hw],
      [baseX - nx * hw, baseY - ny * hw],
    ],
    width,
    color,
    opacity,
    dashed,
  };
}

function arrowSvg(a: OverlayArrow, orientation: Color, scale: number): string {
  const g = arrowGeometry(a, orientation, scale);
  const poly = g.head.map((pt) => `${pt[0].toFixed(3)},${pt[1].toFixed(3)}`).join(' ');
  return `<g opacity="${g.opacity.toFixed(2)}">
    <path d="${g.d}" fill="none" stroke="${g.color}" stroke-width="${g.width.toFixed(3)}" stroke-linejoin="round" ${
      g.dashed ? `stroke-dasharray="${(g.width * 1.4).toFixed(3)} ${(g.width * 1.1).toFixed(3)}"` : 'stroke-linecap="round"'
    }/>
    <polygon points="${poly}" fill="${g.color}"/>
  </g>`;
}

function focusPath(square: string, orientation: Color): string {
  const [cx, cy] = center(square, orientation);
  const x = cx - 0.5;
  const y = cy - 0.5;
  const inset = 0.07;
  const len = 0.26;
  const a = x + inset;
  const b = y + inset;
  const c = x + 1 - inset;
  const e = y + 1 - inset;
  return [
    `M${a} ${b + len} L${a} ${b} L${a + len} ${b}`,
    `M${c - len} ${b} L${c} ${b} L${c} ${b + len}`,
    `M${c} ${e - len} L${c} ${e} L${c - len} ${e}`,
    `M${a + len} ${e} L${a} ${e} L${a} ${e - len}`,
  ].join(' ');
}

function focusSvg(square: string, kind: string, orientation: Color, scale: number): string {
  const w = 0.055 * scale;
  const color = kind === 'opponent' ? COLORS.opponent : COLORS.best;
  return `<g class="focus"><path d="${focusPath(square, orientation)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="square"/></g>`;
}

const GLYPHS = new Set(['★', '✓', '?!', '?', '??', '!', '!!']);

function badgeSvg(square: string, glyph: string, tone: Tone, orientation: Color, scale: number): string {
  if (!GLYPHS.has(glyph) || !(tone in TONE) || squareIndex(square) < 0) return '';
  const [cx, cy] = center(square, orientation);
  const r = 0.19 * scale;
  const bx = cx + 0.5 - r * 0.85;
  const by = cy - 0.5 + r * 0.85;
  const size = glyph.length > 1 ? 0.2 : 0.24;
  return `<g class="badge">
    <circle cx="${bx}" cy="${by}" r="${r}" fill="${TONE[tone]}" stroke="#fff" stroke-width="0.035"/>
    <text x="${bx}" y="${by}" dy="0.075" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="800" font-size="${size * scale}" fill="#fff">${glyph}</text>
  </g>`;
}

export class Overlay {
  private host: HTMLElement;
  private svg: SVGSVGElement;
  private arrowsLayer: SVGGElement;
  private focusLayer: SVGGElement;
  private badgeLayer: SVGGElement;
  private focusKey = '';
  private badgeKey = '';
  private model: OverlayModel | null = null;
  private drawn: OverlayArrow[] = [];
  private held = false;
  private pending: OverlayModel | null = null;
  orientation: Color = 'w';

  constructor() {
    this.host = document.createElement('zugblick-overlay');
    setStyles(this.host, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      'pointer-events': 'none',
      'z-index': '2147483646',
      display: 'none',
      margin: '0',
      padding: '0',
      border: '0',
      transform: 'none',
    });
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    const ns = 'http://www.w3.org/2000/svg';
    this.svg = document.createElementNS(ns, 'svg');
    this.svg.setAttribute('viewBox', '0 0 8 8');
    this.arrowsLayer = document.createElementNS(ns, 'g');
    this.focusLayer = document.createElementNS(ns, 'g');
    this.badgeLayer = document.createElementNS(ns, 'g');
    this.svg.append(this.focusLayer, this.arrowsLayer, this.badgeLayer);
    root.appendChild(this.svg);
    document.documentElement.appendChild(this.host);
  }

  place(rect: DOMRect | null) {
    if (!rect || rect.width < 40) {
      setStyles(this.host, { display: 'none' });
      return;
    }
    setStyles(this.host, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  setOrientation(o: Color) {
    if (o === this.orientation) return;
    this.orientation = o;
    this.focusKey = '';
    this.badgeKey = '';
    if (this.model) this.render(this.model);
  }

  /** Zeichnen anhalten (für ein Bildschirmfoto), Änderungen werden gesammelt. */
  hold() {
    this.held = true;
  }

  /** Für ein sauberes Foto ganz ausblenden (nur bei großen Stellungssprüngen). */
  hide() {
    this.held = true;
    setStyles(this.host, { visibility: 'hidden' });
  }

  release() {
    setStyles(this.host, { visibility: 'visible' });
    this.held = false;
    const p = this.pending;
    this.pending = null;
    if (p) this.render(p);
  }

  render(model: OverlayModel) {
    if (this.held) {
      this.pending = model;
      return;
    }
    this.model = model;
    const o = this.orientation;
    const s = model.scale;
    // Nebenpfeile zuerst, damit der beste Zug oben liegt.
    const ordered = model.arrows
      .filter((a) => squareIndex(a.from) >= 0 && squareIndex(a.to) >= 0 && a.from !== a.to && a.kind in COLORS)
      .sort((a, b) => (a.kind === 'alt' ? 0 : 1) - (b.kind === 'alt' ? 0 : 1));
    this.drawn = ordered;
    this.arrowsLayer.innerHTML = ordered.map((a) => arrowSvg(a, o, s)).join('');
    const fKey = model.focus.map((f) => f.square + f.kind).join('|') + s;
    if (fKey !== this.focusKey) {
      this.focusKey = fKey;
      this.focusLayer.innerHTML = model.focus
        .filter((f) => squareIndex(f.square) >= 0)
        .map((f) => focusSvg(f.square, f.kind, o, s))
        .join('');
    }
    const b = model.badge;
    const bKey = b ? b.square + b.glyph + b.tone + s : '';
    if (bKey !== this.badgeKey) {
      this.badgeKey = bKey;
      this.badgeLayer.innerHTML = b ? badgeSvg(b.square, b.glyph, b.tone, o, s) : '';
    }
  }

  /**
   * Welche Pixel des Bretts hat Zugblick selbst übermalt? (für die Bilderkennung,
   * die diese Stellen ignoriert, statt die Pfeile zum Fotografieren auszublenden)
   */
  mask(size: number): Uint8Array | null {
    const m = this.model;
    if (!m || (!this.drawn.length && !m.focus.length && !m.badge)) return null;
    const c = new OffscreenCanvas(size, size);
    const g = c.getContext('2d')!;
    g.scale(size / 8, size / 8);
    g.strokeStyle = '#000';
    g.fillStyle = '#000';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const o = this.orientation;
    for (const a of this.drawn) {
      const geo = arrowGeometry(a, o, m.scale);
      g.lineWidth = geo.width + 0.08;
      g.stroke(new Path2D(geo.d));
      const head = new Path2D();
      geo.head.forEach(([x, y], i) => (i ? head.lineTo(x, y) : head.moveTo(x, y)));
      head.closePath();
      g.fill(head);
      g.lineWidth = 0.08;
      g.stroke(head);
    }
    g.lineCap = 'square';
    for (const f of m.focus) {
      if (squareIndex(f.square) < 0) continue;
      g.lineWidth = 0.055 * m.scale + 0.07;
      g.stroke(new Path2D(focusPath(f.square, o)));
    }
    if (m.badge && squareIndex(m.badge.square) >= 0) {
      const [cx, cy] = center(m.badge.square, o);
      const r = 0.19 * m.scale;
      g.beginPath();
      g.arc(cx + 0.5 - r * 0.85, cy - 0.5 + r * 0.85, r + 0.05, 0, Math.PI * 2);
      g.fill();
    }
    const d = g.getImageData(0, 0, size, size).data;
    const out = new Uint8Array(size * size);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3]! > 0 ? 1 : 0;
    return out;
  }

  clear() {
    this.model = null;
    this.drawn = [];
    this.focusKey = '';
    this.badgeKey = '';
    this.arrowsLayer.innerHTML = '';
    this.focusLayer.innerHTML = '';
    this.badgeLayer.innerHTML = '';
  }

  destroy() {
    this.host.remove();
  }
}
