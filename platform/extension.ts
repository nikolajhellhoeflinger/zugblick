// Chrome-Erweiterung: Speicher, Dateien und Panel über die Erweiterungs-Schnittstellen.
import { browser } from 'wxt/browser';
import type { PlatformKind, Store } from './types';

export const KIND: PlatformKind = 'extension';

export const store: Store = {
  async get<T>(key: string) {
    const got = await browser.storage.local.get(key);
    return got[key] as T | undefined;
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
  async remove(key) {
    await browser.storage.local.remove(key);
  },
  onChange<T>(key: string, fn: (value: T | undefined) => void) {
    browser.storage.onChanged.addListener((changes) => {
      if (changes[key]) fn(changes[key].newValue as T | undefined);
    });
  },
};

/** Datei aus `public/`, z. B. `/pieces/bK.svg`. */
export const assetUrl = (path: string) => browser.runtime.getURL(path as '/pieces/wK.svg');

export const engineUrl = () => '/stockfish/stockfish-19-lite-single.js';

/** Panel-Seite in den Rahmen laden. Rückgabe: Herkunft für die Übergabe des Kanals. */
export function loadPanel(frame: HTMLIFrameElement, nonce: string): string {
  frame.src = `${browser.runtime.getURL('/panel.html')}#${nonce}`;
  return new URL(browser.runtime.getURL('/')).origin;
}

/** Im Panel: der Einmal-Schlüssel, den das Inhalts-Skript mitgegeben hat. */
export const panelNonce = () => location.hash.slice(1);

export async function captureTab(): Promise<{ dataUrl?: string; error?: string }> {
  return (await browser.runtime.sendMessage({ type: 'zb-capture' })) as { dataUrl?: string; error?: string };
}

/** Tastenkürzel / Klick aufs Symbol (kommt über den Hintergrund). */
export function onToggle(fn: () => void) {
  browser.runtime.onMessage.addListener((msg: unknown) => {
    if ((msg as { type?: string })?.type === 'zb-toggle') fn();
  });
}
