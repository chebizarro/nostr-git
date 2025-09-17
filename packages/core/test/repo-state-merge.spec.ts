import { describe, it, expect } from 'vitest';
import type { RepoStateEvent } from '@nostr-git/shared-types';
import { mergeRepoStateByMaintainers } from '../src/lib/repoState';

function makeStateEvent(
  id: string,
  pubkey: string,
  created_at: number,
  tags: string[][]
): RepoStateEvent {
  return {
    id,
    kind: 30618,
    pubkey,
    created_at,
    content: '',
    tags,
    sig: ''
  } as unknown as RepoStateEvent;
}

describe('mergeRepoStateByMaintainers', () => {
  it('keeps only maintainer-authored refs and selects newest per ref', () => {
    const maint = new Set<string>(['maint1']);

    const events: RepoStateEvent[] = [
      makeStateEvent('e1', 'maint1', 1000, [[`refs/heads/main`, 'c1']]),
      makeStateEvent('e2', 'maint1', 1500, [[`refs/heads/main`, 'c2']]),
      makeStateEvent('e3', 'other', 2000, [[`refs/heads/main`, 'c3']]), // should be ignored (not maintainer)
      makeStateEvent('e4', 'maint1', 1200, [[`refs/tags/v1.0.0`, 't1']]),
      makeStateEvent('e5', 'maint1', 1100, [[`refs/tags/v1.0.0`, 't0']]) // older tag ref
    ];

    const refs = mergeRepoStateByMaintainers({ states: events, maintainers: maint });

    expect(refs['refs/heads/main']).toBeDefined();
    expect(refs['refs/heads/main'].commit).toBe('c2');
    expect(refs['refs/heads/main'].eventId).toBe('e2');

    expect(refs['refs/tags/v1.0.0']).toBeDefined();
    expect(refs['refs/tags/v1.0.0'].commit).toBe('t1');
    expect(refs['refs/tags/v1.0.0'].eventId).toBe('e4');
  });

  it('respects HEAD projection (latest maintainer wins)', () => {
    const maint = new Set<string>(['m1']);

    const events: RepoStateEvent[] = [
      makeStateEvent('h1', 'm1', 1000, [[`HEAD`, 'ref: refs/heads/main']]),
      makeStateEvent('h2', 'm1', 2000, [[`HEAD`, 'ref: refs/heads/dev']]),
      makeStateEvent('h3', 'm2', 3000, [[`HEAD`, 'ref: refs/heads/other']]) // not a maintainer
    ];

    const refs = mergeRepoStateByMaintainers({ states: events, maintainers: maint });

    expect(refs['HEAD']).toBeDefined();
    expect(refs['HEAD'].commit).toBe('ref: refs/heads/dev');
    expect(refs['HEAD'].eventId).toBe('h2');
  });
});
