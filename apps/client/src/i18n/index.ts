import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import pl from './locales/pl.json';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  detectLanguage,
  matchLanguage,
  rememberLanguage,
} from './languages';

/** Every locale file, keyed by its language code. */
export const resources = {
  en: { translation: en },
  es: { translation: es },
  pl: { translation: pl },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    // React already escapes interpolated values.
    escapeValue: false,
  },
});

/**
 * Keeps the document in step with the language: the `lang` attribute (for
 * screen readers, hyphenation and fonts) and the page title. The interface is
 * left-to-right only for now.
 */
function applyDocumentLanguage(code: string): void {
  document.documentElement.lang = code;
  document.documentElement.dir = 'ltr';
  document.title = i18n.t('app.title');
}

i18n.on('languageChanged', applyDocumentLanguage);
applyDocumentLanguage(i18n.language);

/** Switches language and remembers the choice. */
export function changeLanguage(code: string): void {
  rememberLanguage(code);
  void i18n.changeLanguage(code);
}

/** The supported code currently in effect (never a regional tag like `es-419`). */
export function currentLanguage(): string {
  return matchLanguage(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LANGUAGE;
}

export default i18n;
