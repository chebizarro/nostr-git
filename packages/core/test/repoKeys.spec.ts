import { describe, it, expect, vi } from 'vitest';
import { canonicalRepoKey, warnIfLegacyRepoKey } from '../src/lib/repoKeys';

describe('repoKeys', () => {
  it('builds canonical key npub/name with fallback to npub', () => {
    expect(canonicalRepoKey({ npub: 'npub1alice', name: 'repo' })).toBe('npub1alice/repo');
    expect(canonicalRepoKey({ npub: 'npub1alice', name: '  repo  ' })).toBe('npub1alice/repo');
    expect(canonicalRepoKey({ npub: ' npub1alice ' })).toBe('npub1alice');
  });

  it('throws when npub missing', () => {
    // @ts-expect-error
    expect(() => canonicalRepoKey({})).toThrow();
  });

  it('warns on legacy keys (event id or 30617: prefix)', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfLegacyRepoKey('30617:deadbeef');
    warnIfLegacyRepoKey('0'.repeat(64));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
