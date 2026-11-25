// Einstieg des Userscripts: dasselbe Inhalts-Skript wie in der Chrome-Erweiterung,
// nur mit einem schlanken Ersatz für WXTs Skript-Kontext.
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import script from '@/entrypoints/content/index';

const ctx = {
  addEventListener: (target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) =>
    target.addEventListener(type, handler, options),
  setInterval: (fn: () => void, ms: number) => window.setInterval(fn, ms),
  setTimeout: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  isValid: true,
  isInvalid: false,
  signal: new AbortController().signal,
  onInvalidated: () => () => {},
} as unknown as ContentScriptContext;

const w = window as unknown as { __zugblick?: boolean };
if (window.top === window && !w.__zugblick) {
  w.__zugblick = true;
  void script.main(ctx);
}
