import { store } from '@/platform/current';
import type { LanguageSetting } from '@/lib/i18n';

export interface Settings {
  /** null = volle Stockfish-Stärke. */
  elo: number | null;
  /** Chess Bot 1 statt Stockfish-Stärke (dann ist `elo` null). */
  bot: boolean;
  /** Bedenkzeit beim automatischen Spielen in Sekunden (von, bis). */
  tempoMin: number;
  tempoMax: number;
  /**
   * gleich: überall zwischen von und bis gleich wahrscheinlich; unregelmaessig: meist kurz, manchmal lang;
   * menschlich: nach Stellung – Eröffnung schnell, Mittelspiel langsamer, schwere Entscheidungen lang, offensichtliche kurz.
   */
  tempoArt: 'gleich' | 'unregelmaessig' | 'menschlich';
  /** Nach Partieende automatisch „Neues Spiel“ klicken und weiterspielen. */
  autoNewGame: boolean;
  /** Spielzeit in Minuten für das automatische Spielen; 0 = unbegrenzt. */
  sessionMinutes: number;
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
  /** Sprache der Oberfläche; auto = Sprache des Browsers. */
  language: LanguageSetting;
}

export const DEFAULTS: Settings = {
  elo: null,
  bot: false,
  tempoMin: 1,
  tempoMax: 4,
  tempoArt: 'unregelmaessig',
  autoNewGame: false,
  sessionMinutes: 0,
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
  language: 'auto',
};

export const DEPTH: Record<Settings['depth'], number> = { fast: 16, normal: 22, deep: 30 };
export const ELO_STEPS = [2000, 2200, 2400, 2600, 2800] as const;

const KEY = 'zb:settings';

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...DEFAULTS, ...((await store.get<Partial<Settings>>(KEY)) ?? {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings) {
  void store.set(KEY, s).catch(() => {});
}
