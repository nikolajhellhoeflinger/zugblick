export interface Settings {
  /** null = volle Stockfish-Stärke. */
  elo: number | null;
  lines: number;
  arrows: 'all' | 'best' | 'off';
  depth: 'fast' | 'normal' | 'deep';
  threat: boolean;
  quality: boolean;
  myTurnOnly: boolean;
  large: boolean;
  theme: 'auto' | 'light' | 'dark';
  autoStart: boolean;
  compact: boolean;
}

export const DEFAULTS: Settings = {
  elo: null,
  lines: 3,
  arrows: 'all',
  depth: 'normal',
  threat: false,
  quality: true,
  myTurnOnly: false,
  large: false,
  theme: 'auto',
  autoStart: true,
  compact: false,
};

export const DEPTH: Record<Settings['depth'], number> = { fast: 16, normal: 22, deep: 30 };
export const ELO_STEPS = [2000, 2200, 2400, 2600, 2800] as const;

const KEY = 'zb:settings';

export async function loadSettings(): Promise<Settings> {
  try {
    const got = await browser.storage.local.get(KEY);
    return { ...DEFAULTS, ...((got[KEY] as Partial<Settings>) ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  void browser.storage.local.set({ [KEY]: s }).catch(() => {});
}
