import type { TFunction } from 'i18next';

/**
 * Translates a key that is built at run time (for example from a config id),
 * where the literal key cannot be checked at compile time. Prefer the typed
 * `t` whenever the key is a known literal, so the catalog stays checked.
 */
export function tDynamic(
  t: TFunction,
  key: string,
  options?: Record<string, unknown>,
): string {
  const translate = t as unknown as (k: string, o?: Record<string, unknown>) => string;
  return translate(key, options);
}
