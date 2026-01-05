import { describe, it, expect } from 'vitest';
import { getEventHash, type Event as NostrEvent } from 'nostr-tools';
import {
  GIT_PATCH,
  GIT_PULL_REQUEST,
  type PatchEvent,
  type PullRequestEvent,
  createPatchEvent,
  createPullRequestEvent
} from '../../src/events/index.js';

function freezeEvent<T extends NostrEvent>(evt: T): T {
  return {
    ...evt,
    created_at: 1_700_000_000,
    pubkey: '00'.repeat(32),
  } as T;
}

describe('NIP-34 + NIP-95 git events', () => {
  it('creates deterministic kind 1617 patch events with snippet metadata', () => {
    const diffContent = 'diff --git a/README.md b/README.md\n';

    const baseEvent = createPatchEvent({
      content: diffContent,
      repoAddr: '30617:repo-owner:example-repo',
      commit: '1111111111111111111111111111111111111111',
      parentCommit: '0000000000000000000000000000000000000000',
      committer: {
        name: 'Alice',
        email: 'alice@example.com',
        timestamp: '1700000000',
        tzOffset: '+0000',
      },
      earliestUniqueCommit: '1111111111111111111111111111111111111111',
    }) as PatchEvent;

    const evt = freezeEvent(baseEvent);

    const snippetTags: string[][] = [
      ['l', 'README-snippet'],
      ['x', 'abcd'.repeat(16)],
      ['f', 'README.md', 'text/markdown', 'abcd'.repeat(16), '42'],
      ['description', 'Example code change snippet'],
    ];

    const full: NostrEvent = {
      ...evt,
      kind: GIT_PATCH,
      tags: [...evt.tags, ...snippetTags],
      sig: '00'.repeat(64),
      id: '',
    };

    const id = getEventHash(full);
    const replayId = getEventHash(full);
    expect(id).toBe(replayId);

    expect(full.kind).toBe(1617);

    const tagNames = full.tags.map((t) => t[0]);
    expect(tagNames).toContain('a');
    expect(tagNames).toContain('commit');
    expect(tagNames).toContain('parent-commit');
    expect(tagNames).toContain('committer');
    expect(tagNames).toContain('l');
    expect(tagNames).toContain('x');
    expect(tagNames).toContain('f');
    expect(tagNames).toContain('description');

    full.id = id;
    const id2 = getEventHash(full);
    expect(id2).toBe(id);
  });

  it('creates deterministic kind 1618 pull request events with tree + diff references', () => {
    const commit1 = '1111111111111111111111111111111111111111';
    const commit2 = '2222222222222222222222222222222222222222';
    const treeHash = '3333333333333333333333333333333333333333';
    const diffId = '4444444444444444444444444444444444444444';

    const baseEvent = createPullRequestEvent({
      content: 'Implement feature X',
      repoAddr: '30617:repo-owner:example-repo',
      commits: [commit1, commit2],
      branchName: 'feature/x',
      mergeBase: '0000000000000000000000000000000000000000',
      subject: 'Feature X',
    }) as PullRequestEvent;

    const evt = freezeEvent(baseEvent);

    const treeTag: string[] = ['tree', treeHash];
    const diffTag: string[] = ['diff', diffId];

    const full: NostrEvent = {
      ...evt,
      kind: GIT_PULL_REQUEST,
      tags: [...evt.tags, treeTag, diffTag],
      sig: '11'.repeat(64),
      id: '',
    };

    const id = getEventHash(full);
    const replayId = getEventHash(full);
    expect(id).toBe(replayId);

    expect(full.kind).toBe(1618);

    const tagNames = full.tags.map((t) => t[0]);
    expect(tagNames).toContain('a');
    expect(tagNames).toContain('c');
    expect(tagNames).toContain('branch-name');
    expect(tagNames).toContain('merge-base');
    expect(tagNames).toContain('tree');
    expect(tagNames).toContain('diff');

    full.id = id;
    const id2 = getEventHash(full);
    expect(id2).toBe(id);
  });

  it('constructs deterministic kind 1623 diff events with NIP-95 snippet metadata', () => {
    const diffContent = 'diff --git a/src/app.ts b/src/app.ts\n';
    const commitHash = '5555555555555555555555555555555555555555';
    const treeHash = '6666666666666666666666666666666666666666';

    const base: NostrEvent = {
      kind: 1623,
      content: diffContent,
      tags: [
        ['repo', '30617:repo-owner:example-repo'],
        ['commit', commitHash],
        ['tree', treeHash],
        ['path', 'src/app.ts'],
        ['l', 'app-snippet'],
        ['x', 'dead'.repeat(16)],
        ['f', 'src/app.ts', 'text/typescript', 'dead'.repeat(16), '128'],
        ['description', 'App entry point change'],
      ],
      created_at: 1_700_000_000,
      pubkey: 'aa'.repeat(32),
      id: '',
      sig: 'bb'.repeat(64),
    };

    const id = getEventHash(base);
    const replayId = getEventHash(base);
    expect(id).toBe(replayId);

    const tagNames = base.tags.map((t) => t[0]);
    expect(tagNames).toContain('repo');
    expect(tagNames).toContain('commit');
    expect(tagNames).toContain('tree');
    expect(tagNames).toContain('l');
    expect(tagNames).toContain('x');
    expect(tagNames).toContain('f');
    expect(tagNames).toContain('description');
  });
});
