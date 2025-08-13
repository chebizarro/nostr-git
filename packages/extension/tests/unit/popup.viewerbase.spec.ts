import { describe, it, expect } from 'vitest';
import { normalizeViewerBase } from '../../src/popup-logic';

describe('normalizeViewerBase', () => {
  it('adds https scheme when missing and ensures trailing slash', () => {
    const out = normalizeViewerBase('njump.me');
    expect(out).toBe('https://njump.me/');
  });

  it('keeps https and appends trailing slash', () => {
    const out = normalizeViewerBase('https://example.com');
    expect(out).toBe('https://example.com/');
  });

  it('preserves path and ensures trailing slash', () => {
    const out = normalizeViewerBase('https://example.com/viewer');
    expect(out).toBe('https://example.com/viewer/');
  });

  it('throws on empty after trim', () => {
    expect(() => normalizeViewerBase('   ')).toThrow();
  });
});
