import { describe, expect, it } from 'vitest';
import { VISIBILITY_CHOICES, loadVisibility, shareCodeLabel, visibilityBlurb } from '../visibility';
import { englishT } from '../../../i18n/testing';

describe('visibility labels', () => {
  const t = englishT();

  it('offers private first, so it is the safe default', () => {
    expect(VISIBILITY_CHOICES).toEqual(['private', 'public']);
  });

  it('calls a private room secret a key and a public one a code', () => {
    expect(shareCodeLabel(t, 'private')).toBe('Room key');
    expect(shareCodeLabel(t, 'public')).toBe('Room code');
  });

  it('describes both kinds', () => {
    expect(visibilityBlurb(t, 'private')).toMatch(/not listed/i);
    expect(visibilityBlurb(t, 'public')).toMatch(/listed/i);
  });

  it('falls back to private when nothing can be remembered', () => {
    // No browser storage here, as in a private window.
    expect(loadVisibility()).toBe('private');
  });
});
