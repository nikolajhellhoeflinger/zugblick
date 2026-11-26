// Bilderkennung für Seiten ohne lesbares Brett-HTML (Canvas, Videos, Bilder, unbekannte Apps).
// Fotografiert den sichtbaren Tab, schneidet das Brett aus und erkennt die Stellung.
import { captureTab, store } from '@/platform/current';
import { placementToFen, squareName, type Placement } from '@/lib/board';
import type { BoardRead, VisionState } from '@/lib/protocol';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import builtin from './vision-builtin.json';
import { analyze, classify, learn, refine, searchArea, gridScore, toLuma, SIZE, type Prior, type TemplateSet } from './recognize';

const BUILTIN = builtin as unknown as TemplateSet[];
const TICK_MS = 600;
const STORE = `zb:vision:${location.hostname}`;

interface Anchor {
  el: Element | null;
  /** Anteile relativ zum Anker-Element bzw. Seitenkoordinaten ohne Anker */
  fx: number;
  fy: number;
  fs: number;
  pageX: number;
  pageY: number;
  size: number;
}

function setStyles(el: HTMLElement, styles: Record<string, string>) {
  for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important');
}

async function capture(): Promise<ImageBitmap> {
  const res = await captureTab();
  if (!res?.dataUrl) throw new Error(res?.error || 'capture-failed');
  // data:-URL selbst dekodieren – fetch() könnte an der CSP der Seite scheitern.
  const b64 = res.dataUrl.slice(res.dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
}

function isOurs(el: Element) {
  const t = el.tagName.toLowerCase();
  return t === 'zugblick-overlay' || t === 'zugblick-panel' || t === 'zugblick-mark';
}

export class Vision {
  active = false;
  private anchor: Anchor | null = null;
  private timer = 0;
  private busy = false;
  private learned: TemplateSet | null = null;
  private lastKey = '';
  private stable = 0;
  private sentKey = '';
  private failures = 0;
  private markLayer: HTMLElement | null = null;
  private prior: (Prior & { sig: string[] }) | null = null;
  private cleanNext = true;

  constructor(
    private ctx: ContentScriptContext,
    private onRead: (read: BoardRead) => void,
    private onState: (state: VisionState) => void,
    private overlay: { hold: () => void; hide: () => void; release: () => void; mask: (size: number) => Uint8Array | null },
    private panelRect: () => DOMRect | null,
  ) {
    void store
      .get<TemplateSet>(STORE)
      .then((t) => {
        if (t?.shapes?.length) this.learned = t;
      })
      .catch(() => {});
  }

  rect(): DOMRect | null {
    const a = this.anchor;
    if (!this.active || !a) return null;
    if (a.el && a.el.isConnected) {
      const r = a.el.getBoundingClientRect();
      if (r.width > 0) {
        const size = a.fs * r.width;
        return new DOMRect(r.left + a.fx * r.width, r.top + a.fy * r.height, size, size);
      }
    }
    return new DOMRect(a.pageX - scrollX, a.pageY - scrollY, a.size, a.size);
  }

  private setAnchor(r: DOMRect) {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let el: Element | null = null;
    for (const cand of document.elementsFromPoint(cx, cy)) {
      if (isOurs(cand)) continue;
      const b = cand.getBoundingClientRect();
      const tol = r.width * 0.04;
      if (b.left <= r.left + tol && b.top <= r.top + tol && b.right >= r.right - tol && b.bottom >= r.bottom - tol && b.width < r.width * 4) {
        el = cand;
        break;
      }
    }
    const b = el?.getBoundingClientRect();
    this.anchor = {
      el,
      fx: b ? (r.left - b.left) / b.width : 0,
      fy: b ? (r.top - b.top) / b.height : 0,
      fs: b ? r.width / b.width : 0,
      pageX: r.left + scrollX,
      pageY: r.top + scrollY,
      size: r.width,
    };
  }

  /** Brett suchen: erst automatisch, sonst Rahmen von Hand ziehen lassen. */
  async mark() {
    this.stopLoop();
    this.onState({ phase: 'searching' });
    try {
      const found = await this.autoDetect();
      if (found) {
        this.start(found);
        return;
      }
    } catch (e) {
      this.onState({ phase: 'error', message: String((e as Error).message || e) });
    }
    this.onState({ phase: 'marking' });
    const r = await this.drawRect();
    if (!r) {
      this.onState({ phase: 'off' });
      return;
    }
    try {
      const bmp = await capture();
      const refined = this.refineRect(bmp, r, 0.06);
      bmp.close();
      this.start(refined ?? r);
    } catch (e) {
      this.onState({ phase: 'error', message: String((e as Error).message || e) });
    }
  }

  private start(r: DOMRect) {
    this.setAnchor(r);
    this.active = true;
    this.lastKey = '';
    this.sentKey = '';
    this.stable = 0;
    this.failures = 0;
    this.prior = null;
    this.cleanNext = true;
    this.onState({ phase: 'scanning', learned: !!this.learned });
    this.stopLoop();
    this.timer = this.ctx.setInterval(() => void this.tick(), TICK_MS);
    void this.tick();
  }

  stop() {
    this.stopLoop();
    this.active = false;
    this.anchor = null;
    this.markLayer?.remove();
    this.markLayer = null;
    this.onState({ phase: 'off' });
  }

  private stopLoop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  forget() {
    this.learned = null;
    void store.remove(STORE).catch(() => {});
    if (this.active) this.onState({ phase: 'scanning', learned: false });
  }

  learnStart() {
    /* gelernt wird automatisch, sobald die Grundstellung sichtbar ist */
  }

  /** Rechteck (CSS-px) im Foto pixelgenau ausrichten. */
  private refineRect(bmp: ImageBitmap, r: DOMRect, radius: number): DOMRect | null {
    const scale = bmp.width / innerWidth;
    const pad = Math.round(r.width * scale * (radius + 0.02));
    const sx = Math.max(0, Math.round(r.left * scale) - pad);
    const sy = Math.max(0, Math.round(r.top * scale) - pad);
    const sw = Math.min(bmp.width - sx, Math.round(r.width * scale) + 2 * pad);
    const sh = Math.min(bmp.height - sy, Math.round(r.height * scale) + 2 * pad);
    if (sw < 64 || sh < 64) return null;
    const c = new OffscreenCanvas(sw, sh);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    const L = toLuma(g.getImageData(0, 0, sw, sh).data, sw, sh);
    const start = { x: Math.round(r.left * scale) - sx, y: Math.round(r.top * scale) - sy, size: Math.round(r.width * scale) };
    const best = refine(L, sw, sh, start, radius);
    if (!(best.score > 2)) return null;
    return new DOMRect((best.x + sx) / scale, (best.y + sy) / scale, best.size / scale, best.size / scale);
  }

  private async autoDetect(): Promise<DOMRect | null> {
    const bmp = await capture();
    try {
      const scale = bmp.width / innerWidth;
      const W = bmp.width;
      const H = bmp.height;
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0);
      const L = toLuma(g.getImageData(0, 0, W, H).data, W, H);
      // 1. Kandidaten aus dem Seiten-HTML: quadratische Flächen, Canvas, Bilder, Videos
      const cands: { r: DOMRect; video: boolean }[] = [];
      for (const el of Array.from(document.querySelectorAll('canvas, img, video, svg, div, section, figure, picture, iframe'))) {
        if (isOurs(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 160 || r.height < 160 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
        const video = el.tagName === 'VIDEO' || el.tagName === 'IFRAME' || Math.abs(r.width - r.height) > r.width * 0.08;
        if (!video || el.tagName === 'VIDEO' || el.tagName === 'IFRAME' || el.tagName === 'CANVAS') cands.push({ r, video });
        if (cands.length > 400) break;
      }
      let best: { x: number; y: number; size: number; score: number } | null = null;
      const consider = (b: { x: number; y: number; size: number; score: number } | null) => {
        if (b && (!best || b.score > best.score)) best = b;
      };
      const squares = cands
        .filter((c) => !c.video)
        .map((c) => {
          const s = Math.min(c.r.width, c.r.height) * scale;
          const x = Math.round(c.r.left * scale);
          const y = Math.round(c.r.top * scale);
          return { x, y, size: Math.round(s), score: gridScore(L, W, H, x, y, Math.round(s), 0.18) };
        })
        .filter((c) => c.score > 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      for (const s of squares) consider(refine(L, W, H, s, 0.05));
      if (!best || (best as { score: number }).score < 3) {
        for (const v of cands.filter((c) => c.video).slice(0, 3)) {
          const area = {
            x: Math.max(0, Math.round(v.r.left * scale)),
            y: Math.max(0, Math.round(v.r.top * scale)),
            w: Math.round(Math.min(v.r.width, innerWidth - v.r.left) * scale),
            h: Math.round(Math.min(v.r.height, innerHeight - v.r.top) * scale),
          };
          consider(searchArea(L, W, H, area, 500));
        }
      }
      if (!best || (best as { score: number }).score < 3) {
        // 2. Letzter Versuch: ganze sichtbare Fläche, verkleinert
        const f = 3;
        const w = Math.floor(W / f);
        const h = Math.floor(H / f);
        const small = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) small[y * w + x] = L[y * f * W + x * f]!;
        const s = searchArea(small, w, h, { x: 0, y: 0, w, h }, 800);
        if (s && s.score > 3) consider(refine(L, W, H, { x: s.x * f, y: s.y * f, size: s.size * f }, 0.03));
      }
      const b = best as { x: number; y: number; size: number; score: number } | null;
      if (!b || b.score < 3) return null;
      return new DOMRect(b.x / scale, b.y / scale, b.size / scale, b.size / scale);
    } finally {
      bmp.close();
    }
  }

  /** Rahmen mit der Maus ziehen. Esc bricht ab. */
  private drawRect(): Promise<DOMRect | null> {
    return new Promise((resolve) => {
      const layer = document.createElement('zugblick-mark');
      this.markLayer = layer;
      setStyles(layer, {
        position: 'fixed',
        inset: '0',
        'z-index': '2147483645',
        cursor: 'crosshair',
        display: 'block',
      });
      const root = layer.attachShadow({ mode: 'closed' });
      root.innerHTML = `
        <style>
          .veil { position: fixed; inset: 0; background: rgba(12,14,20,.32); }
          .hint { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); padding: 9px 14px; border-radius: 10px;
                  background: #12151b; color: #eef0f3; font: 600 13px/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: .01em;
                  box-shadow: 0 10px 30px -12px rgba(0,0,0,.5); pointer-events: none; }
          .hint span { opacity: .6; font-weight: 500; margin-left: 8px; }
          .box { position: fixed; border: 2px solid #2f6bff; background: rgba(47,107,255,.08); display: none; }
        </style>
        <div class="veil"></div>
        <div class="hint">Zieh einen Rahmen um das Brett<span>Esc bricht ab</span></div>
        <div class="box"></div>`;
      const box = root.querySelector('.box') as HTMLElement;
      let sx = 0;
      let sy = 0;
      let dragging = false;
      const finish = (r: DOMRect | null) => {
        window.removeEventListener('keydown', onKey, true);
        layer.remove();
        this.markLayer = null;
        resolve(r);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(null);
        }
      };
      layer.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        sx = e.clientX;
        sy = e.clientY;
        layer.setPointerCapture(e.pointerId);
      });
      layer.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const size = Math.max(Math.abs(e.clientX - sx), Math.abs(e.clientY - sy));
        const x = e.clientX < sx ? sx - size : sx;
        const y = e.clientY < sy ? sy - size : sy;
        Object.assign(box.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
      });
      layer.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        const size = Math.max(Math.abs(e.clientX - sx), Math.abs(e.clientY - sy));
        if (size < 80) {
          box.style.display = 'none';
          return;
        }
        const x = e.clientX < sx ? sx - size : sx;
        const y = e.clientY < sy ? sy - size : sy;
        // Kurz warten, bis der Schleier weg ist, sonst ist er im Foto.
        layer.remove();
        requestAnimationFrame(() => requestAnimationFrame(() => finish(new DOMRect(x, y, size, size))));
      });
      window.addEventListener('keydown', onKey, true);
      document.documentElement.appendChild(layer);
    });
  }

  private async tick() {
    if (this.busy || !this.active || document.visibilityState === 'hidden') return;
    const r = this.rect();
    if (!r || r.width < 64) return;
    this.busy = true;
    let ignore: Uint8Array | null = null;
    try {
      // Overlay einfrieren und zwei Bilder warten, damit Foto und Maske exakt zusammenpassen.
      // Nach einem großen Sprung einmal ganz ohne Pfeile fotografieren.
      const clean = this.cleanNext;
      this.cleanNext = false;
      if (clean) this.overlay.hide();
      else this.overlay.hold();
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      ignore = clean ? null : this.overlay.mask(SIZE);
      let bmp: ImageBitmap;
      try {
        bmp = await capture();
      } finally {
        this.overlay.release();
      }
      const scale = bmp.width / innerWidth;
      // Ausrichtung nachführen (Seite gescrollt, Fenster verkleinert …)
      const refined = this.refineRect(bmp, r, 0.02);
      const use = refined ?? r;
      if (refined && this.anchor && Math.abs(refined.left - r.left) + Math.abs(refined.top - r.top) + Math.abs(refined.width - r.width) > 1.5) {
        this.setAnchor(refined);
      }
      const c = new OffscreenCanvas(SIZE, SIZE);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(bmp, use.left * scale, use.top * scale, use.width * scale, use.height * scale, 0, 0, SIZE, SIZE);
      bmp.close();
      const px = g.getImageData(0, 0, SIZE, SIZE).data;

      // Eigene Pfeile und das Panel ausblenden (nicht fotografieren, sondern herausrechnen)
      ignore ??= new Uint8Array(SIZE * SIZE);
      const pr = this.panelRect();
      if (pr) {
        const k = SIZE / use.width;
        const x0 = Math.max(0, Math.floor((pr.left - use.left) * k));
        const y0 = Math.max(0, Math.floor((pr.top - use.top) * k));
        const x1 = Math.min(SIZE, Math.ceil((pr.right - use.left) * k));
        const y1 = Math.min(SIZE, Math.ceil((pr.bottom - use.top) * k));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) ignore[y * SIZE + x] = 1;
      }

      const raw = analyze(px, ignore);
      const sig = raw.map((q) => (q.occupied ? (q.white ? 'w' : 'b') : '.'));
      if (!clean && this.prior) {
        let diffs = 0;
        for (let i = 0; i < 64; i++) if (sig[i] !== this.prior.sig[i]) diffs++;
        if (diffs > 4) {
          // Mehr als ein Zug auf einmal: neu und sauber lesen.
          this.cleanNext = true;
          this.stable = 0;
          return;
        }
      }
      const scan = classify(raw, this.learned ? [this.learned] : BUILTIN, clean ? null : this.prior);
      if (scan.start && !this.learned) {
        this.learned = learn(raw, scan.start);
        void store.set(STORE, this.learned).catch(() => {});
        this.onState({ phase: 'scanning', learned: true });
      }
      const placement = placementToFen(scan.placement as Placement);
      const key = `${placement}|${scan.orientation}|${scan.highlights.join(',')}`;
      this.stable = key === this.lastKey ? this.stable + 1 : 0;
      this.lastKey = key;
      // Erst senden, wenn zwei Fotos hintereinander dasselbe zeigen (keine halben Animationen).
      if (this.stable >= 1 || clean) {
        this.prior = { sig, kinds: scan.kinds, white: raw.map((q) => q.white) };
      }
      if (this.stable >= 1 && key !== this.sentKey) {
        this.sentKey = key;
        this.onRead({
          placement,
          orientation: scan.orientation,
          lastMove: scan.highlights.length <= 3 ? scan.highlights.map(squareName) : [],
          source: 'bild',
          analysis: false,
        });
      }
      this.failures = 0;
    } catch (e) {
      this.failures++;
      if (this.failures === 3) this.onState({ phase: 'error', message: String((e as Error).message || e) });
    } finally {
      this.busy = false;
    }
  }
}
