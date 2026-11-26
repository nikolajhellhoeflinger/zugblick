// Was sich zwischen Chrome-Erweiterung und Userscript (Safari, iPhone) unterscheidet.
export type PlatformKind = 'extension' | 'userscript' | 'site';

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** Änderung aus einem anderen Teil (Panel ↔ Inhalts-Skript). */
  onChange<T>(key: string, fn: (value: T | undefined) => void): void;
}
