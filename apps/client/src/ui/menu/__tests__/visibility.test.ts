import { describe, expect, it } from 'vitest';
import {
  VISIBILITY_CHOICES,
  loadVisibility,
  shareCodeLabel,
  visibilityBlurb,
} from '../visibility';

describe('visibility labels', () => {
  it('offers private first, so it is the safe default', () => {
    expect(VISIBILITY_CHOICES.map((choice) => choice.value)).toEqual(['private', 'public']);
  });

  it('calls a private room secret a key and a public one a code', () => {
    expect(shareCodeLabel('private')).toBe('Room key');
    expect(shareCodeLabel('public')).toBe('Room code');
  });

  it('describes both kinds', () => {
    expect(visibilityBlurb('private')).toMatch(/not listed/i);
    expect(visibilityBlurb('public')).toMatch(/listed/i);
  });

  it('falls back to private when nothing can be remembered', () => {
    // No browser storage here, as in a private window.
    expect(loadVisibility()).toBe('private');
  });
});
