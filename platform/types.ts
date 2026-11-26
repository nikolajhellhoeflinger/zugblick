// Was sich zwischen Chrome-Erweiterung und Userscript (Safari, iPhone) unterscheidet.
export type PlatformKind = 'extension' | 'userscript' | 'site';

/** Timer mit derselben Form wie window.setTimeout & Co. (0 = kein Timer). */
export interface Timers {
  setTimeout(fn: () => void, ms: number): number;
  setInterval(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  clearInterval(id: number): void;
}

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Änderung aus einem anderen Teil (Panel ↔ Inhalts-Skript). */
  onChange<T>(key: string, fn: (value: T | undefined) => void): void;
}
