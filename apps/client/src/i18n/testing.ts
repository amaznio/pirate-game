import { createInstance, type TFunction } from 'i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import pl from './locales/pl.json';

/**
 * A synchronous `t()` over the real catalogs, for tests. Built on a throwaway
 * i18next instance so tests need not touch the app's singleton (which reads
 * `window`).
 */
export function tFor(code: string): TFunction {
  const instance = createInstance();
  instance.init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      pl: { translation: pl },
    },
    lng: code,
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
  });
  return instance.t.bind(instance) as unknown as TFunction;
}

export function englishT(): TFunction {
  return tFor('en');
}
