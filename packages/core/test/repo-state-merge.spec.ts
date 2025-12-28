import { describe, it, expect } from 'vitest';
import { mergeRepoStateByMaintainers } from '../src/lib/repoState.js';

function mkStateEvt(pubkey: string, created_at: number, tags: string[][]): any {
  return { pubkey, created_at, tags };
}

describe('mergeRepoStateByMaintainers', () => {
  it('keeps only maintainer-authored refs and picks newest per ref', () => {
    const maintainers = new Set<string>(['npub1a']);
    const e1 = mkStateEvt('npub1a', 10, [
      ['refs/heads/main', 'c1'],
      ['HEAD', 'c1']
    ]);
    const e2 = mkStateEvt('npub1b', 20, [
      ['refs/heads/main', 'c2'], // should be ignored (not maintainer)
      ['HEAD', 'c2']
    ]);
    const e3 = mkStateEvt('npub1a', 30, [
      ['refs/heads/main', 'c3'] // should win by created_at
    ]);

    const merged = mergeRepoStateByMaintainers({ states: [e1, e2, e3] as any, maintainers });
    expect(merged['refs/heads/main'].commit).toBe('c3');
    expect(merged['HEAD'].commit).toBe('c1');
  });
});
