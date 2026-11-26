// Website „Gegen Zugblick spielen“: keine Erweiterungs-Schnittstellen, Dateien vom Webserver.
// site/vite.config.ts ersetzt `@/platform/current` durch diese Datei.
import type { PlatformKind, Store } from './types';

export const KIND: PlatformKind = 'site';

const BASE = import.meta.env.BASE_URL;

export const store: Store = {
  async get<T>(key: string) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Speicher gesperrt */
    }
  },
  async remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Speicher gesperrt */
    }
  },
  onChange() {
    /* nur ein Teil – keine Änderungen von außen */
  },
};

/** Datei aus `public/`, z. B. `/pieces/bK.svg`. */
export const assetUrl = (path: string) => BASE + path.replace(/^\//, '');

export const engineUrl = () => `${BASE}stockfish/stockfish-19-lite-single.js`;

export function loadPanel(): string {
  throw new Error('Kein Panel auf der Website');
}

export const panelNonce = () => '';

export async function captureTab(): Promise<{ dataUrl?: string; error?: string }> {
  return { error: 'Auf der Website nicht verfügbar' };
}

export function onToggle() {
  /* kein Tastenkürzel auf der Website */
}
