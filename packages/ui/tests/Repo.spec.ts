/*
  Repo.spec.ts
  Unit tests for Repo class helpers. This file uses Vitest-style APIs.
  If the workspace does not yet include Vitest, add it as a devDependency and run with `vitest`.
*/

import { describe, it, expect } from 'vitest';
import type { Readable } from 'svelte/store';
import type { RepoAnnouncementEvent, RepoStateEvent, PatchEvent, IssueEvent, NostrEvent } from '@nostr-git/shared-types';
import { Repo } from '../src/lib/components/git/Repo.svelte.ts';

// Simple helpers to create readables
function fromValue<T>(v: T): Readable<T> {
  return {
    subscribe(fn: (v: T) => void) {
      fn(v);
      return () => {};
    },
  } as Readable<T>;
}

// Minimal factory for a repo announcement
function mkRepoAnnouncement(overrides: any = {}): RepoAnnouncementEvent {
  const obj: any = {
    id: overrides.id || 'ev-id-30617',
    kind: 30617,
    pubkey: overrides.pubkey || 'owner-pubkey',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [
      ['d', 'repo-name'],
      ['a', '30617:owner-pubkey:repo-name'],
    ],
    content: overrides.content || '',
    sig: overrides.sig || 'sig',
  };
  return obj as unknown as RepoAnnouncementEvent;
}

function mkRepoState(overrides: any = {}): RepoStateEvent {
  const obj: any = {
    id: overrides.id || 'ev-id-30618',
    kind: 30618,
    pubkey: overrides.pubkey || 'owner-pubkey',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [
      // refs/heads/main pointing at a commit
      ['r', 'refs/heads/main', 'ref'],
      ['r', '0000000000000000000000000000000000000001', 'commit'],
    ],
    content: overrides.content || '',
    sig: overrides.sig || 'sig',
  };
  return obj as unknown as RepoStateEvent;
}

function mkPatch(overrides: any = {}): PatchEvent {
  const obj: any = {
    id: overrides.id || 'patch-1',
    kind: 1617,
    pubkey: overrides.pubkey || 'author-pubkey',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [
      ['t', 'root'],
    ],
    content: overrides.content || '',
    sig: overrides.sig || 'sig',
  };
  return obj as unknown as PatchEvent;
}

function mkIssue(overrides: any = {}): IssueEvent {
  const obj: any = {
    id: overrides.id || 'issue-1',
    kind: 1621,
    pubkey: overrides.pubkey || 'author-pubkey',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: overrides.tags || [],
    content: overrides.content || '',
    sig: overrides.sig || 'sig',
  };
  return obj as unknown as IssueEvent;
}

function mkStatus(overrides: any & { kind: 1630|1631|1632|1633, rootId: string }): NostrEvent {
  return {
    id: overrides.id || `status-${overrides.kind}`,
    kind: overrides.kind,
    pubkey: overrides.pubkey || 'maintainer-1',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [ ['e', overrides.rootId] ] as any,
    content: overrides.content || '',
    sig: overrides.sig || 'sig',
  } as unknown as NostrEvent;
}

function mkComment(rootId: string, overrides: any = {}): NostrEvent {
  return {
    id: overrides.id || `cmt-${Math.random().toString(36).slice(2)}`,
    kind: overrides.kind || 1111,
    pubkey: overrides.pubkey || 'user-1',
    created_at: overrides.created_at || Math.floor(Date.now() / 1000),
    tags: (overrides as any).tags || [ ['e', rootId] ] as any,
    content: overrides.content || 'comment',
    sig: overrides.sig || 'sig',
  } as unknown as NostrEvent;
}


describe('Repo class helpers', () => {
  it('computes canonical key and trusted maintainers', async () => {
    const repoEv = mkRepoAnnouncement({ pubkey: 'owner-abc', tags: [['d','my-repo']] });
    const repo = new Repo({
      repoEvent: fromValue(repoEv),
      repoStateEvent: fromValue(mkRepoState()),
      issues: fromValue([]),
      patches: fromValue([]),
    });
    // allow constructor subscriptions to run
    expect(repo.repoId).toContain('owner-abc:my-repo');
    expect(repo.trustedMaintainers).toContain('owner-abc');
  });

  it('merges refs from multiple 30618 events', async () => {
    const repoEv = mkRepoAnnouncement({ pubkey: 'owner-abc', tags: [['d','repo']] });
    const state1 = mkRepoState({ pubkey: 'owner-abc', created_at: 1000, tags: [ ['r','refs/heads/main','ref'], ['r','1111111111111111111111111111111111111111','commit'] ] });
    const state2 = mkRepoState({ pubkey: 'maint-1', created_at: 2000, tags: [ ['r','refs/heads/main','ref'], ['r','2222222222222222222222222222222222222222','commit'] ] });

    const repo = new Repo({
      repoEvent: fromValue(repoEv),
      repoStateEvent: fromValue(state1),
      issues: fromValue([]),
      patches: fromValue([]),
      repoStateEvents: fromValue([state1, state2])
    });

    const refs = await repo.getAllRefsWithFallback();
    const main = refs.find(r => r.fullRef === 'refs/heads/main');
    expect(main?.commitId).toBe('2222222222222222222222222222222222222222');
  });

  it('builds patch DAG and identifies roots', async () => {
    const p1 = mkPatch({ id: 'p1', tags: [['t','root']] });
    const p2 = mkPatch({ id: 'p2', tags: [['e','p1']] });
    const repo = new Repo({
      repoEvent: fromValue(mkRepoAnnouncement()),
      repoStateEvent: fromValue(mkRepoState()),
      issues: fromValue([]),
      patches: fromValue([p1, p2])
    });

    const dag = repo.getPatchGraph();
    expect(dag.roots).toContain('p1');
    expect(Array.from(dag.nodes.keys())).toContain('p2');
  });

  it('resolves status with precedence and author/trust policy', async () => {
    const issue = mkIssue({ id: 'i1', pubkey: 'author-x' });
    const s1 = mkStatus({ kind: 1630, rootId: 'i1', pubkey: 'author-x', created_at: 1000 }); // open by author
    const s2 = mkStatus({ kind: 1632, rootId: 'i1', pubkey: 'maintainer-1', created_at: 2000 }); // closed by trusted

    const repo = new Repo({
      repoEvent: fromValue(mkRepoAnnouncement({ pubkey: 'owner-abc' })),
      repoStateEvent: fromValue(mkRepoState()),
      issues: fromValue([issue]),
      patches: fromValue([]),
      statusEvents: fromValue([s1, s2])
    });

    const status = repo.resolveStatusFor('i1');
    expect(status?.state).toBe('closed');
  });

  it('returns NIP-22 scoped comments for a root', async () => {
    const issue = mkIssue({ id: 'i2' });
    const c1 = mkComment('i2', { created_at: 1000 });
    const c2 = mkComment('i2', { created_at: 2000 });

    const repo = new Repo({
      repoEvent: fromValue(mkRepoAnnouncement()),
      repoStateEvent: fromValue(mkRepoState()),
      issues: fromValue([issue]),
      patches: fromValue([]),
      commentEvents: fromValue([c2, c1])
    });

    const thread = repo.getIssueThread('i2');
    expect(thread.comments[0].created_at).toBe(1000);
    expect(thread.comments[1].created_at).toBe(2000);
  });

  it('merges labels (self + external + legacy t)', async () => {
    const p = mkPatch({ id: 'p3', tags: [['t','bug']] });
    const externalLabel: NostrEvent = {
      id: 'lbl-1',
      kind: 1985,
      pubkey: 'maint-1',
      created_at: Math.floor(Date.now()/1000),
      tags: [ ['L','p3','e'], ['l','type:feature'] ],
      content: '',
      sig: 'sig',
    } as unknown as NostrEvent;

    const repo = new Repo({
      repoEvent: fromValue(mkRepoAnnouncement()),
      repoStateEvent: fromValue(mkRepoState()),
      issues: fromValue([]),
      patches: fromValue([p]),
      labelEvents: fromValue([externalLabel])
    });

    const labels = repo.getPatchLabels('p3');
    expect(Array.from(labels.flat)).toContain('type:feature');
  });
});
