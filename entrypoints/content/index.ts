import { pickAdapter, type BoardAdapter } from '@/content/readers';
import { Overlay } from '@/content/overlay';
import { PanelHost } from '@/content/panel-host';
import { Vision } from '@/content/vision';
import { squareName, type Color } from '@/lib/board';
import type { BoardRead, ToContent } from '@/lib/protocol';

/** Automatisch öffnen nur bei Brettern ab dieser Kantenlänge (keine Vorschaubilder). */
const AUTO_MIN = 280;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    let active = false;
    let dismissed = false;
    let autoStart = true;
    let host: PanelHost | null = null;
    let overlay: Overlay | null = null;
    let current: { adapter: BoardAdapter; el: Element } | null = null;
    let observer: MutationObserver | null = null;
    let lastKey = '';
    let orientation: Color = 'w';
    let readTimer = 0;
    let lastRect = '';
    let vision: Vision | null = null;

    const rect = (): DOMRect | null => {
      if (vision?.active) return vision.rect();
      if (!current || !current.el.isConnected) return null;
      return current.adapter.rect(current.el);
    };

    const sendRead = (read: BoardRead) => {
      orientation = read.orientation;
      overlay?.setOrientation(read.orientation);
      const key = `${read.placement}|${read.orientation}|${read.lastMove.join(',')}`;
      if (key === lastKey) return;
      lastKey = key;
      host?.send({ type: 'board', read });
    };

    const attach = (found: { adapter: BoardAdapter; el: Element }) => {
      observer?.disconnect();
      current = found;
      lastKey = '';
      observer = new MutationObserver(() => scheduleRead(40));
      observer.observe(found.el, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    };

    const readNow = () => {
      if (!active || vision?.active) return;
      if (!current || !current.el.isConnected) {
        const found = pickAdapter();
        if (!found) {
          current = null;
          observer?.disconnect();
          overlay?.place(null);
          if (lastKey !== 'none') {
            lastKey = 'none';
            host?.send({ type: 'no-board' });
          }
          return;
        }
        attach(found);
      }
      const read = current!.adapter.read(current!.el);
      if (!read) {
        scheduleRead(120);
        return;
      }
      overlay?.place(rect());
      sendRead(read);
    };

    function scheduleRead(delay: number) {
      window.clearTimeout(readTimer);
      readTimer = window.setTimeout(readNow, delay);
    }

    const placeAll = () => {
      if (!active) return;
      const r = rect();
      const key = r ? `${r.left|0},${r.top|0},${r.width|0},${r.height|0}` : '';
      if (key === lastRect) return;
      lastRect = key;
      overlay?.place(r);
      host?.reanchor();
    };

    const onPanelMessage = (msg: ToContent) => {
      if (msg.type === 'overlay') {
        overlay?.render(msg.overlay);
        overlay?.place(rect());
      } else if (msg.type === 'close') {
        dismissed = true;
        deactivate();
      } else if (msg.type === 'vision') {
        if (!vision) vision = new Vision(ctx, (read) => sendRead(read), (state) => host?.send({ type: 'vision', state }));
        if (msg.action === 'mark') {
          observer?.disconnect();
          current = null;
          lastKey = '';
          vision.mark();
        } else if (msg.action === 'stop') {
          vision.stop();
          lastKey = '';
          readNow();
        } else if (msg.action === 'learn') vision.learnStart();
        else if (msg.action === 'forget') vision.forget();
      }
    };

    function activate() {
      if (active) return;
      active = true;
      overlay = new Overlay();
      host = new PanelHost(onPanelMessage, rect);
      host.send({ type: 'host', host: location.hostname, path: location.pathname });
      lastKey = '';
      readNow();
    }

    function deactivate() {
      if (!active) return;
      active = false;
      observer?.disconnect();
      observer = null;
      vision?.stop();
      host?.destroy();
      host = null;
      overlay?.destroy();
      overlay = null;
      current = null;
      lastKey = '';
    }

    // Klick auf eine Figur → Panel rechnet den besten Zug genau dieser Figur.
    ctx.addEventListener(
      window,
      'pointerdown',
      (e: PointerEvent) => {
        if (!active || e.button !== 0) return;
        const r = rect();
        if (!r) return;
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (x < 0 || y < 0 || x >= r.width || y >= r.height) {
          return;
        }
        const col = Math.floor((x / r.width) * 8);
        const row = Math.floor((y / r.height) * 8);
        const file = orientation === 'w' ? col : 7 - col;
        const rank = orientation === 'w' ? 7 - row : row;
        host?.send({ type: 'select', square: squareName(rank * 8 + file) });
      },
      { capture: true },
    );

    ctx.addEventListener(window, 'scroll', placeAll, { capture: true, passive: true });
    ctx.addEventListener(window, 'resize', placeAll, { passive: true });
    ctx.setInterval(() => {
      placeAll();
      // Seiten tauschen ihr Brett bei Navigation oft aus (Single-Page-Apps).
      if (active && !vision?.active && (!current || !current.el.isConnected)) readNow();
      if (!active && autoStart && !dismissed && pickAdapter(AUTO_MIN)) activate();
    }, 700);

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if ((msg as { type?: string })?.type === 'zb-toggle') {
        if (active) {
          dismissed = true;
          deactivate();
        } else {
          dismissed = false;
          activate();
        }
      }
    });

    void browser.storage.local
      .get('zb:settings')
      .then((got) => {
        const s = got['zb:settings'] as { autoStart?: boolean } | undefined;
        autoStart = s?.autoStart ?? true;
        if (autoStart && pickAdapter(AUTO_MIN)) activate();
      })
      .catch(() => {
        if (pickAdapter(AUTO_MIN)) activate();
      });

    browser.storage.onChanged.addListener((changes) => {
      const next = changes['zb:settings']?.newValue as { autoStart?: boolean } | undefined;
      if (next) autoStart = next.autoStart ?? true;
    });
  },
});
