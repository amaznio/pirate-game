import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';
import es from '../locales/es.json';
import pl from '../locales/pl.json';

/**
 * Every leaf key path in a catalog, e.g. `lobby.startMatch`. Plural suffixes
 * (`_one`, `_few`, `_many`, `_other`, ...) are stripped, so a language with more
 * plural forms than English (Polish has four) still matches key for key.
 */
function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [prefix.replace(/_(zero|one|two|few|many|other)$/, '')];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('locale catalogs', () => {
  it('every locale has exactly the English keys', () => {
    const enKeys = [...new Set(keys(en))].sort();
    expect(enKeys.length).toBeGreaterThan(0);
    for (const [code, catalog] of Object.entries({ es, pl })) {
      expect([...new Set(keys(catalog))].sort(), `keys of ${code}.json`).toEqual(enKeys);
    }
  });
});
