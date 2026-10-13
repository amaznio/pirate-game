import { describe, expect, it } from 'vitest';

/**
 * The React UI takes its colours from the theme tokens in `index.css`, so the
 * look cannot drift. This fails when a screen or component writes a raw colour
 * (a hex value, rgb(), hsl()) instead of a token class.
 *
 * The Phaser code draws the board and has its own colours; it is not scanned.
 * A line that really needs a raw colour can end with `raw-colour-ok`.
 */
const files = import.meta.glob('/src/{ui,kit,app,components}/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const RAW_COLOUR = /(?:^|[^\w&])#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;

describe('theme tokens', () => {
  it('scans the UI source', () => {
    expect(Object.keys(files).length).toBeGreaterThan(20);
  });

  it('keeps raw colours out of the UI source', () => {
    const offences: string[] = [];
    for (const [path, source] of Object.entries(files)) {
      if (path.includes('/__tests__/')) {
        continue;
      }
      source.split(/\r?\n/).forEach((line, index) => {
        if (RAW_COLOUR.test(line) && !line.includes('raw-colour-ok')) {
          offences.push(`${path}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offences).toEqual([]);
  });
});
