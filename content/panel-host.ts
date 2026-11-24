// Bettet das Panel (eine Erweiterungsseite) als schwebendes Fenster in die Seite ein
// und hält einen privaten Nachrichtenkanal dorthin offen.
import type { ToContent, ToPanel } from '@/lib/protocol';

const MARGIN = 16;

/** Seiten-CSS (z. B. `iframe { max-width: … }`) darf das Panel nicht verformen. */
function setStyles(el: HTMLElement, styles: Record<string, string>) {
  for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important');
}

interface Pos {
  x: number;
  y: number;
}

export class PanelHost {
  private frame: HTMLIFrameElement;
  private shell: HTMLElement;
  private port: MessagePort | null = null;
  private queue: ToPanel[] = [];
  private width = 340;
  private height = 120;
  private pos: Pos | null = null;
  private drag: { sx: number; sy: number; px: number; py: number } | null = null;
  private storageKey = `zb:pos:${location.hostname}`;

  constructor(
    private onMessage: (msg: ToContent) => void,
    private anchor: () => DOMRect | null,
  ) {
    // Einmal-Schlüssel: nur wer ihn kennt, darf den Kanal zum Panel öffnen.
    // Er steht im Fragment der Panel-Adresse, und die liegt in einem geschlossenen
    // Shadow-DOM – Seiten-Skripte kommen an beides nicht heran.
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    const frame = document.createElement('iframe');
    frame.src = `${browser.runtime.getURL('/panel.html')}#${nonce}`;
    frame.title = 'Zugblick';
    frame.setAttribute('allow', '');
    setStyles(frame, {
      position: 'fixed',
      'z-index': '2147483647',
      border: '0',
      'border-radius': '16px',
      width: `${this.width}px`,
      height: `${this.height}px`,
      'min-width': '0',
      'min-height': '0',
      'max-width': 'none',
      'max-height': 'none',
      left: '-9999px',
      top: '0px',
      right: 'auto',
      bottom: 'auto',
      'color-scheme': 'normal',
      background: 'transparent',
      'box-shadow': '0 0 0 1px rgba(16,18,24,.10), 0 18px 40px -18px rgba(16,18,24,.45)',
      transition: 'height 180ms ease-out, width 180ms ease-out',
      display: 'block',
      margin: '0',
      padding: '0',
      transform: 'none',
      opacity: '1',
      visibility: 'visible',
      'pointer-events': 'auto',
    });
    this.frame = frame;

    const channel = new MessageChannel();
    frame.addEventListener('load', () => {
      const origin = new URL(browser.runtime.getURL('/')).origin;
      frame.contentWindow?.postMessage({ zb: 'init', nonce }, origin, [channel.port2]);
    });
    channel.port1.onmessage = (e: MessageEvent<ToContent>) => this.handle(e.data);
    this.port = null;
    this.pendingPort = channel.port1;

    this.shell = document.createElement('zugblick-panel');
    setStyles(this.shell, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: '0px',
      height: '0px',
      margin: '0',
      padding: '0',
      border: '0',
      display: 'block',
      'z-index': '2147483647',
      transform: 'none',
    });
    this.shell.attachShadow({ mode: 'closed' }).appendChild(frame);
    document.documentElement.appendChild(this.shell);
    void this.restore();
    window.addEventListener('resize', this.onResize);
  }

  private pendingPort: MessagePort;

  private handle(msg: ToContent) {
    if (msg.type === 'ready') {
      this.port = this.pendingPort;
      for (const m of this.queue) this.port.postMessage(m);
      this.queue = [];
      return;
    }
    if (msg.type === 'size') {
      this.width = msg.width;
      this.height = msg.height;
      setStyles(this.frame, { width: `${msg.width}px`, height: `${msg.height}px` });
      this.apply();
      return;
    }
    if (msg.type === 'drag') {
      this.onDrag(msg.phase, msg.screenX, msg.screenY);
      return;
    }
    this.onMessage(msg);
  }

  /** Während Zugblick selbst auf das Brett klickt: Panel für Klicks durchlässig (falls es über dem Brett liegt). */
  passThrough(on: boolean) {
    setStyles(this.frame, { 'pointer-events': on ? 'none' : 'auto' });
  }

  rect(): DOMRect {
    return this.frame.getBoundingClientRect();
  }

  send(msg: ToPanel) {
    if (this.port) this.port.postMessage(msg);
    else {
      // Nur den letzten Stand je Art aufheben.
      this.queue = this.queue.filter((m) => m.type !== msg.type);
      this.queue.push(msg);
    }
  }

  private async restore() {
    try {
      const got = await browser.storage.local.get(this.storageKey);
      const saved = got[this.storageKey] as Pos | undefined;
      if (saved && typeof saved.x === 'number') this.pos = saved;
    } catch {
      /* ohne Speicher: Standardplatz */
    }
    this.apply();
  }

  /** Standardplatz: rechts neben dem Brett, sonst unten rechts. */
  private defaultPos(): Pos {
    const r = this.anchor();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (r && r.right + MARGIN + this.width + MARGIN <= vw) {
      return { x: r.right + MARGIN, y: Math.max(MARGIN, r.top) };
    }
    if (r && r.left - MARGIN - this.width >= MARGIN) {
      return { x: r.left - MARGIN - this.width, y: Math.max(MARGIN, r.top) };
    }
    return { x: vw - this.width - MARGIN, y: vh - this.height - MARGIN };
  }

  private apply() {
    const p = this.pos ?? this.defaultPos();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(Math.max(MARGIN / 2, p.x), Math.max(MARGIN / 2, vw - this.width - MARGIN / 2));
    const y = Math.min(Math.max(MARGIN / 2, p.y), Math.max(MARGIN / 2, vh - this.height - MARGIN / 2));
    setStyles(this.frame, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px` });
  }

  /** Brett hat sich verschoben: ohne eigene Position mitwandern. */
  reanchor() {
    if (!this.pos) this.apply();
  }

  private onResize = () => this.apply();

  private onDrag(phase: 'start' | 'move' | 'end', sx: number, sy: number) {
    if (phase === 'start') {
      const left = parseFloat(this.frame.style.left) || 0;
      const top = parseFloat(this.frame.style.top) || 0;
      this.drag = { sx, sy, px: left, py: top };
      setStyles(this.frame, { transition: 'none' });
      return;
    }
    if (!this.drag) return;
    this.pos = { x: this.drag.px + (sx - this.drag.sx), y: this.drag.py + (sy - this.drag.sy) };
    this.apply();
    if (phase === 'end') {
      this.drag = null;
      setStyles(this.frame, { transition: 'height 180ms ease-out, width 180ms ease-out' });
      const left = parseFloat(this.frame.style.left) || 0;
      const top = parseFloat(this.frame.style.top) || 0;
      this.pos = { x: left, y: top };
      void browser.storage.local.set({ [this.storageKey]: this.pos }).catch(() => {});
    }
  }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    this.port?.close();
    this.pendingPort.close();
    this.shell.remove();
  }
}
