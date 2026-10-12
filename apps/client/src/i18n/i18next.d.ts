import 'i18next';
import type en from './locales/en.json';

/**
 * Makes `t()` type-safe: keys are checked against the English catalog, so a
 * typo or a key missing from `en.json` fails `pnpm typecheck`.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
