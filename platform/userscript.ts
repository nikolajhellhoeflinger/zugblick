// Userscript (Safari über die App „Userscripts“, auch iPhone): alles läuft in der Seite selbst.
// Panel = eingebetteter Rahmen mit eigenem Dokument, Stockfish vom CDN, Speicher = localStorage der Seite.
import type { PlatformKind, Store } from './types';

declare const __ZB_PANEL_HTML__: string;

export const KIND: PlatformKind = 'userscript';

/** Feste, unveränderliche Fassung der Stockfish-Dateien (Git-Tag). */
const CDN = 'https://cdn.jsdelivr.net/gh/nikolajhellhoeflinger/zugblick@v1.0.11/public/';
const NONCE = 'zb:';

const read = <T>(key: string): T | undefined => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? undefined : (JSON.parse(v) as T);
  } catch {
    return undefined;
  }
};

export const store: Store = {
  async get<T>(key: string) {
    return read<T>(key);
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Speicher voll oder gesperrt */
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* egal */
    }
  },
  onChange<T>(key: string, fn: (value: T | undefined) => void) {
    // Panel und Inhalts-Skript sind getrennte Dokumente derselben Herkunft: dort kommt das storage-Ereignis an.
    window.addEventListener('storage', (e) => {
      if (e.key === key) fn(read<T>(key));
    });
  },
};

// Figuren direkt im Skript (kein Netz nötig).
const PIECES = import.meta.glob('/public/pieces/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const assetUrl = (path: string) => {
  const svg = PIECES['/public' + path];
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : CDN + path.replace(/^\//, '');
};

let engine = '';
/** Kleiner Starter-Worker, der Stockfish vom CDN nachlädt; die WASM-Adresse steht im Fragment. */
export const engineUrl = () =>
  (engine ||=
    URL.createObjectURL(
      new Blob([`importScripts(${JSON.stringify(CDN + 'stockfish/stockfish-19-lite-single.js')});`], { type: 'application/javascript' }),
    ) +
    '#' +
    encodeURIComponent(CDN + 'stockfish/stockfish-19-lite-single.wasm'));

export function loadPanel(frame: HTMLIFrameElement, nonce: string): string {
  frame.name = NONCE + nonce;
  frame.srcdoc = __ZB_PANEL_HTML__;
  return location.origin;
}

export const panelNonce = () => (window.name.startsWith(NONCE) ? window.name.slice(NONCE.length) : '');

export async function captureTab(): Promise<{ dataUrl?: string; error?: string }> {
  return { error: 'Bilderkennung gibt es nur in der Chrome-Erweiterung.' };
}

/** Alt+Shift+Z ein/aus (kein Hintergrund-Skript im Userscript). */
export function onToggle(fn: () => void) {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyZ') {
        e.preventDefault();
        fn();
      }
    },
    true,
  );
}
