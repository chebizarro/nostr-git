import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import { canonicalRepoKey } from '../../src/utils/canonical-repo-key.js';

describe('utils/canonical-repo-key', () => {
  it('accepts owner/name and normalizes segments', () => {
    expect(canonicalRepoKey('Owner/Repo')).toBe('Owner/Repo');
    expect(canonicalRepoKey('own er/re po')).toBe('own-er/re-po');
    expect(canonicalRepoKey('own/er/repo')).toBe('own/er'); // split only first ':' or '/'
  });

  it('accepts owner:name and converts to slash', () => {
    expect(canonicalRepoKey('owner:repo')).toBe('owner/repo');
    expect(canonicalRepoKey('own er:re po')).toBe('own-er/re-po');
  });

  it('rejects empty and malformed', () => {
    expect(() => canonicalRepoKey('')).toThrow(/Invalid repoId/);
    expect(() => canonicalRepoKey('owner/')).toThrow(/both parts present/);
    expect(() => canonicalRepoKey('owner:')).toThrow(/both parts present/);
  });

  it('rejects event-id like values', () => {
    const eid = 'a'.repeat(64);
    expect(() => canonicalRepoKey(eid)).toThrow(/event id-like/);
  });
});
