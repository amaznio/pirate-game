/**
 * The languages the client offers. Add a language here and a matching
 * `locales/<code>.json` to make it selectable; everything else follows.
 */

export interface LanguageInfo {
  /** BCP-47 code, matching the locale file name (e.g. `en`, `es`). */
  readonly code: string;
  /** Name shown in the switcher, in the language itself. */
  readonly label: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pl', label: 'Polski' },
];

export const DEFAULT_LANGUAGE = 'en';

export const SUPPORTED_LANGUAGES: readonly string[] = LANGUAGES.map((language) => language.code);

/** Where the chosen language is remembered between visits. */
const STORAGE_KEY = 'pirate:lang';

export function isSupportedLanguage(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && SUPPORTED_LANGUAGES.includes(code);
}

/**
 * The supported language closest to a BCP-47 tag: an exact match, else the
 * base language (`es-419` -> `es`), else null.
 */
export function matchLanguage(tag: string | null | undefined): string | null {
  if (!tag) {
    return null;
  }
  const lower = tag.toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find((code) => code.toLowerCase() === lower);
  if (exact) {
    return exact;
  }
  const base = lower.split('-')[0];
  return SUPPORTED_LANGUAGES.find((code) => code === base) ?? null;
}

/**
 * The language to start in: `?lang=` first (so a link can pick one), then the
 * remembered choice, then the browser's, then the default.
 */
export function detectLanguage(): string {
  const fromUrl = matchLanguage(new URLSearchParams(window.location.search).get('lang'));
  if (fromUrl) {
    return fromUrl;
  }
  try {
    const saved = matchLanguage(window.localStorage.getItem(STORAGE_KEY));
    if (saved) {
      return saved;
    }
  } catch {
    // Storage can be unavailable (private window); fall through.
  }
  return matchLanguage(window.navigator.language) ?? DEFAULT_LANGUAGE;
}

/** Remembers the chosen language for the next visit. */
export function rememberLanguage(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Not being able to remember the choice is fine.
  }
}
