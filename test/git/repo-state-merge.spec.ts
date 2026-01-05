import { describe, it, expect } from 'vitest';
import { RepoCore } from '../../src/git/repo-core.js';
import type { RepoStateEvent } from '../../src/events/nip34/nip34.js';

function mkStateEvt(pubkey: string, created_at: number, tags: string[][]): RepoStateEvent {
  return {
    id: `${pubkey}-${created_at}`,
    kind: 30618,
    pubkey,
    created_at,
    content: '',
    tags,
    sig: ''
  } as unknown as RepoStateEvent;
}

describe('mergeRepoStateByMaintainers', () => {
  it('keeps only maintainer-authored refs and picks newest per ref', () => {
    const maintainers = ['npub1a'];
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

    const merged = RepoCore.mergeRepoStateByMaintainers({ maintainers }, [e1, e2, e3]);
    expect(merged.get('heads:main')?.commitId).toBe('c3');
    expect(merged.get('heads:main')?.fullRef).toBe('refs/heads/main');
    expect(merged.get('heads:main')?.type).toBe('heads');
    expect(merged.get('tags:HEAD')).toBeUndefined();
  });
});
