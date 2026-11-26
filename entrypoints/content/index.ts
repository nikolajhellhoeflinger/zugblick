import { findFenTurn, pickAdapter, type BoardAdapter } from '@/content/readers';
import { Overlay } from '@/content/overlay';
import { PanelHost } from '@/content/panel-host';
import { executeMove } from '@/content/mover';
import { Vision } from '@/content/vision';
import { squareIndex, squareName, type Color } from '@/lib/board';
import type { BoardRead, ToContent } from '@/lib/protocol';
import { onToggle, store } from '@/platform/current';
import { defineContentScript } from 'wxt/utils/define-content-script';

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
    // Wartezeiten beim Ziehen lässt das Panel wecken: seine Timer drosselt Chrome im Hintergrund-Tab nicht,
    // normale Timer hier schon (nach 5 Minuten bis auf einmal pro Minute). Antwortet das Panel nicht,
    // weckt ein normaler Timer etwas später – nie hängen bleiben.
    let sleepId = 0;
    const sleepers = new Map<number, () => void>();
    const panelSleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const id = ++sleepId;
        const done = () => {
          if (sleepers.delete(id)) resolve();
        };
        sleepers.set(id, done);
        host?.send({ type: 'sleep', id, ms });
        window.setTimeout(done, host ? ms + 1500 : ms);
      });
    let overlay: Overlay | null = null;
    let current: { adapter: BoardAdapter; el: Element } | null = null;
    let observer: MutationObserver | null = null;
    let lastKey = '';
    let orientation: Color = 'w';
    let readTimer = 0;
    let lastRect = '';
    let vision: Vision | null = null;
    let synthetic = false;

    /** Ein Mausklick auf ein Feld, so wie ihn die Seite von einer Hand bekäme. */
    const clickSquare = (square: string) => {
      const r = rect();
      if (!r) return false;
      const i = squareIndex(square);
      const file = i % 8;
      const rank = Math.floor(i / 8);
      const col = orientation === 'w' ? file : 7 - file;
      const row = orientation === 'w' ? 7 - rank : rank;
      const x = r.left + ((col + 0.5 + (Math.random() - 0.5) * 0.4) / 8) * r.width;
      const y = r.top + ((row + 0.5 + (Math.random() - 0.5) * 0.4) / 8) * r.height;
      // Das oberste Element unter dem Punkt, das zum Brett gehört – nicht unser Panel, falls es darüber liegt.
      const hits = document.elementsFromPoint(x, y);
      const board = current?.el;
      const target =
        (board && hits.find((el) => board === el || board.contains(el))) ??
        hits.find((el) => el.tagName !== 'ZUGBLICK-PANEL');
      if (!target) return false;
      const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse' };
      synthetic = true;
      try {
        target.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
        target.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
        target.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
        target.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
      } finally {
        synthetic = false;
      }
      return true;
    };

    /** Knopf für ein neues Spiel: „Neues Spiel“, „Neue 10 Minuten“, „Neues Turnier“, „New game“ usw.
     *  Nimmt jeden Text, der „neu/new“ und danach ein Spiel-Wort (Spiel, Partie, Turnier, Minuten …) enthält. */
    const NEW_GAME =
      /\b(neues?\s+(spiel|turnier)\w*|new\s+(game|tournament)|(neue?|new)\s*,?\s*\d+\s*(min\w*|[+|]\s*\d+))/i;
    /** Alle Knöpfe der Seite – auch in eingekapselten Bausteinen (offene Shadow-Roots). */
    const allButtons = (): HTMLElement[] => {
      const out: HTMLElement[] = [];
      const walk = (root: Document | ShadowRoot, depth: number) => {
        out.push(
          ...root.querySelectorAll<HTMLElement>(
            'button, a, [role="button"], [role="link"], [role="menuitem"], input[type="button"], input[type="submit"]',
          ),
        );
        if (depth > 4) return;
        for (const el of root.querySelectorAll<HTMLElement>('*')) if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      };
      walk(document, 0);
      return out;
    };
    const clickNewGame = () => {
      // Sichtbarer Text zuerst (ohne versteckte Hinweise), sonst Beschriftung für Screenreader, Titel, Eingabewert.
      // Immer EIN Text pro Knopf: Die „Weiter“- und „Spielen“-Suche vergleicht den ganzen Text (^…$).
      const label = (el: HTMLElement) =>
        (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() ||
        el.getAttribute('aria-label')?.trim() ||
        el.title.trim() ||
        (el as HTMLInputElement).value?.trim() ||
        '';
      // Nur für die Suche nach „Neues Spiel“: alles, was die Seite dem Knopf mitgibt.
      const hint = (el: HTMLElement) =>
        [label(el), el.getAttribute('aria-label'), el.title].join(' ').replace(/\s+/g, ' ').trim();
      const all = allButtons().filter(
        (el) =>
          el.getClientRects().length > 0 &&
          !(el as HTMLButtonElement).disabled &&
          el.getAttribute('aria-disabled') !== 'true' &&
          !el.closest('zugblick-panel'),
      );
      // 1. Jeder Knopf, dessen kurzer Text nach einem neuen Spiel klingt. Der kürzeste Treffer gewinnt.
      const candidates = all
        .map((el) => ({ el, t: label(el), h: hint(el) }))
        .filter((c) => c.t.length > 0 && c.t.length <= 80 && NEW_GAME.test(c.h))
        .sort((a, b) => a.t.length - b.t.length);
      const fresh = candidates[0]?.el;
      if (!fresh) {
        // Diagnose: Beschriftungen mit „neu“/„new“, die es auf der Seite gibt (in der Browser-Konsole).
        console.debug(
          '[Zugblick] kein Knopf für neues Spiel gefunden:',
          all.map(label).filter((t) => /neu|new/i.test(t) && t.length <= 80).slice(0, 15),
        );
      }
      // 2. Nach Neuladen bietet die Seite „Weiter“ (laufende Partie) neben dem neuen Spiel an: weiterspielen.
      let resume: HTMLElement | undefined;
      for (let box = fresh?.parentElement, i = 0; box && i < 5 && !resume; box = box.parentElement, i++) {
        const scope = box;
        resume = all.find((el) => scope.contains(el) && /^(weiter|fortsetzen|continue|resume)$/i.test(label(el)));
      }
      if (resume) return resume.click();
      // 3. Neue Partie.
      if (fresh) return fresh.click();
      // Zurück in der Bot-Auswahl (z. B. nach Neuladen): dort heißt der Knopf „Spielen“. Nur auf der
      // Computer-Seite – anderswo sucht „Spielen“ einen menschlichen Gegner.
      if (/\/play\/computer/.test(location.pathname)) {
        all.find((el) => el.tagName === 'BUTTON' && /^(spielen|play|starten|start)$/i.test(label(el)))?.click();
      }
    };

    /** Autospielen über ein Neuladen der Seite retten (nur dieser Tab, nur wenn es eben noch lief). */
    const AUTOPLAY_KEY = 'zb:autoplay';
    const rememberAutoplay = (on: boolean, until: number) => {
      try {
        if (on) sessionStorage.setItem(AUTOPLAY_KEY, JSON.stringify({ until, at: Date.now() }));
        else sessionStorage.removeItem(AUTOPLAY_KEY);
      } catch {
        /* ohne Speicher: kein Fortsetzen */
      }
    };
    const resumeAutoplay = () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(AUTOPLAY_KEY) ?? 'null') as { until: number; at: number } | null;
        if (!saved || Date.now() - saved.at > 60_000) return;
        if (saved.until && Date.now() >= saved.until) return;
        host?.send({ type: 'resume', until: saved.until });
      } catch {
        /* nichts */
      }
    };

    // Ein Zug nach dem anderen; während einer läuft, kommt kein zweiter dazu.
    let moving = false;
    const boardPlacement = (): string | null => {
      if (!current || !current.el.isConnected || vision?.active) return null;
      return current.adapter.read(current.el)?.placement ?? null;
    };
    const playMove = async (m: { from: string; to: string; promotion: boolean; before: string; after: string }) => {
      if (moving) {
        host?.send({ type: 'move-result', ok: false, stale: true });
        return;
      }
      moving = true;
      host?.passThrough(true);
      try {
        const outcome = await executeMove(
          {
            click: (sq) => clickSquare(sq),
            placement: boardPlacement,
            sleep: panelSleep,
          },
          m,
        );
        host?.send({ type: 'move-result', ok: outcome === 'ok', stale: outcome === 'stale' });
      } catch {
        host?.send({ type: 'move-result', ok: false, stale: false });
      } finally {
        moving = false;
        host?.passThrough(false);
      }
    };

    const rect = (): DOMRect | null => {
      if (vision?.active) return vision.rect();
      if (!current || !current.el.isConnected) return null;
      return current.adapter.rect(current.el);
    };

    const sendRead = (read: BoardRead) => {
      orientation = read.orientation;
      overlay?.setOrientation(read.orientation);
      const key = `${read.placement}|${read.orientation}|${read.lastMove.join(',')}|${read.turn ?? ''}`;
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
      read.turn = findFenTurn(read.placement);
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
      } else if (msg.type === 'wake') {
        sleepers.get(msg.id)?.();
      } else if (msg.type === 'tick') {
        housekeeping();
      } else if (msg.type === 'newgame') {
        clickNewGame();
      } else if (msg.type === 'autoplay') {
        rememberAutoplay(msg.on, msg.until);
      } else if (msg.type === 'play') {
        void playMove(msg);
      } else if (msg.type === 'close') {
        dismissed = true;
        deactivate();
      } else if (msg.type === 'vision') {
        if (!vision) {
          vision = new Vision(
            ctx,
            (read) => {
              overlay?.place(rect());
              sendRead(read);
            },
            (state) => {
              host?.send({ type: 'vision', state });
              if (state.phase === 'off' && active) {
                lastKey = '';
                readNow();
              }
            },
            {
              hold: () => overlay?.hold(),
              hide: () => overlay?.hide(),
              release: () => overlay?.release(),
              mask: (size) => overlay?.mask(size) ?? null,
            },
            () => host?.rect() ?? null,
          );
        }
        if (msg.action === 'mark') {
          observer?.disconnect();
          current = null;
          lastKey = '';
          vision.mark();
        } else if (msg.action === 'stop') {
          vision.stop();
        } else if (msg.action === 'learn') vision.learnStart();
        // (Stop setzt den DOM-Leser über den Zustand 'off' wieder in Gang.)
        else if (msg.action === 'forget') vision.forget();
      }
    };

    function activate() {
      if (active) return;
      active = true;
      overlay = new Overlay();
      host = new PanelHost(onPanelMessage, rect);
      host.send({ type: 'host', host: location.hostname, path: location.pathname });
      resumeAutoplay();
      lastKey = '';
      readNow();
    }

    function deactivate() {
      if (!active) return;
      active = false;
      rememberAutoplay(false, 0);
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
        if (!active || synthetic || e.button !== 0) return;
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
    const housekeeping = () => {
      placeAll();
      // Seiten tauschen ihr Brett bei Navigation oft aus (Single-Page-Apps).
      if (active && !vision?.active && (!current || !current.el.isConnected)) readNow();
      if (!active && autoStart && !dismissed && pickAdapter(AUTO_MIN)) activate();
    };
    // Im Hintergrund-Tab drosselt Chrome diesen Takt; beim Autospielen stößt das Panel ihn zusätzlich an („tick“).
    ctx.setInterval(housekeeping, 700);

    onToggle(() => {
      if (active) {
        dismissed = true;
        deactivate();
      } else {
        dismissed = false;
        activate();
      }
    });

    void store
      .get<{ autoStart?: boolean }>('zb:settings')
      .then((s) => {
        autoStart = s?.autoStart ?? true;
        if (autoStart && pickAdapter(AUTO_MIN)) activate();
      })
      .catch(() => {
        if (pickAdapter(AUTO_MIN)) activate();
      });

    store.onChange<{ autoStart?: boolean }>('zb:settings', (next) => {
      if (next) autoStart = next.autoStart ?? true;
    });
  },
});
