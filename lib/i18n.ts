// Sprache der Oberfläche (Deutsch/Englisch) mit i18next. „auto“ = Sprache des Browsers.
// React-Teile nutzen useTranslation() und zeichnen sich bei einem Sprachwechsel neu;
// alles andere (Controller, Zugbeschreibung) nutzt `t` direkt.
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './locales/de';
import en from './locales/en';

export type LanguageSetting = 'auto' | 'de' | 'en';

export function resolveLanguage(setting: LanguageSetting): 'de' | 'en' {
  if (setting !== 'auto') return setting;
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

void i18next.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: resolveLanguage('auto'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
});

export const t = i18next.t.bind(i18next);

export function applyLanguage(setting: LanguageSetting) {
  const lang = resolveLanguage(setting);
  if (i18next.language !== lang) void i18next.changeLanguage(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export default i18next;
