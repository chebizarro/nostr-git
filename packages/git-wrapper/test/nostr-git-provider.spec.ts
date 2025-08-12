import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NostrGitProvider } from '../src/nostr-git-provider.js';
import type { GitProvider, GitFetchResult, GitMergeResult } from '../src/provider.js';
import type { NostrEvent } from '../src/nostr-client.js';
import { GIT_REPO_ANNOUNCEMENT, GIT_REPO_STATE, GIT_PATCH, GIT_STATUS_APPLIED, GIT_STATUS_CLOSED } from '@nostr-git/shared-types';
import { makeRepoAddr } from '../src/repo-addr.js';

function makeEvent(overrides: Partial<NostrEvent>): NostrEvent {
  return {
    id: overrides.id ?? 'evtid',
    kind: overrides.kind ?? 1,
    pubkey: overrides.pubkey ?? 'f'.repeat(64),
    created_at: overrides.created_at ?? Math.floor(Date.now() / 1000),
    tags: overrides.tags ?? [],
    content: overrides.content ?? '',
    sig: overrides.sig ?? 'sig',
  } as unknown as NostrEvent;
}

describe('NostrGitProvider', () => {
  let git: Partial<GitProvider>;
  let nostr: {
    publish: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    git = {
      clone: vi.fn(async () => {}),
      push: vi.fn(async (opts) => ({ ok: true, opts })),
      merge: vi.fn(async () => ({ fastForward: true } as GitMergeResult)),
      resolveRef: vi.fn(async ({ ref }: any) => `${ref}-oid`),
      readCommit: vi.fn(async ({ oid }: any) => ({ commit: { message: `subject for ${oid}\nbody`, parent: ['parent-'+oid], committer: { name: 'C', email: 'c@example.com', timestamp: 1, timezoneOffset: 0 } } })),
      fetch: vi.fn(async () => ({ defaultBranch: 'refs/heads/main', fetchHead: null, fetchHeadDescription: null } as GitFetchResult)),
      TREE: vi.fn(() => ({})),
    };
    let subCb: ((e: NostrEvent) => void) | null = null;
    nostr = {
      publish: vi.fn(async (evt: NostrEvent) => evt.id || Math.random().toString(36).slice(2)),
      subscribe: vi.fn((filter: any, cb: (e: NostrEvent) => void) => {
        subCb = cb;
        return 'subid';
      }),
      unsubscribe: vi.fn(() => {}),
    } as any;
  });

  it('push retries with alternate URL on failure and updates prefs', async () => {
    // Arrange push to fail first then succeed when url === https
    (git.push as any) = vi.fn(async (opts: any) => {
      if (opts.url === 'ssh://git@host/repo-1') throw new Error('ssh failed');
      return { ok: true };
    });
    const provider = new NostrGitProvider(git as GitProvider, nostr as any);
    const set = vi.fn();
    const get = vi.fn(() => undefined);
    provider.configureProtocolPrefsStore({ get, set });
    // Stub discoverRepo directly for deterministic fallback behavior
    const discSpy = vi.spyOn(provider as any, 'discoverRepo').mockResolvedValue({ urls: ['ssh://git@host/repo-1', 'https://host/repo-1'] });
    const res = await provider.push({
      refspecs: ['refs/heads/main'],
      repoId: 'repo-1',
      url: 'ssh://git@host/repo-1',
      timeoutMs: 10,
    });
    expect(res.server).toEqual({ ok: true });
    expect(set).toHaveBeenCalledWith('repo-1', 'https://host/repo-1');
    discSpy.mockRestore();
  });

  it('push emits closed status when close=true', async () => {
    const provider = new NostrGitProvider(git as GitProvider, nostr as any);
    await provider.push({
      refspecs: ['refs/heads/main'],
      nostrStatus: {
        repoAddr: makeRepoAddr('f'.repeat(64), 'repo-1'),
        rootId: 'root-evt',
        close: true,
      },
    });
    const publishedKinds = (nostr.publish as any).mock.calls.map((c: any[]) => c[0].kind);
    expect(publishedKinds).toContain(GIT_STATUS_APPLIED);
    expect(publishedKinds).toContain(GIT_STATUS_CLOSED);
  });

  it('discoverRepo parses clone URLs from announcement', async () => {
    const provider = new NostrGitProvider(git as GitProvider, nostr as any);
    // Arrange: subscribe should emit an announcement with two clone URLs
    (nostr.subscribe as any).mockImplementation((filter: any, cb: (e: NostrEvent) => void) => {
      const evt = makeEvent({
        kind: GIT_REPO_ANNOUNCEMENT,
        tags: [
          ['d', 'repo-1'],
          ['clone', 'ssh://git@host/repo-1', 'https://host/repo-1'],
        ],
      });
      cb(evt);
      return 'sub1';
    });
    const res = await provider.discoverRepo('repo-1', { timeoutMs: 10, stateKind: GIT_REPO_STATE });
    expect(res.urls).toContain('ssh://git@host/repo-1');
    expect(res.urls).toContain('https://host/repo-1');
  });

  it('push partitions PR and normal refs and publishes patch event', async () => {
    const provider = new NostrGitProvider(git as GitProvider, nostr as any);
    // Mock announcement for recipients discovery
    (nostr.subscribe as any).mockImplementationOnce((filter: any, cb: (e: NostrEvent) => void) => {
      cb(makeEvent({ kind: GIT_REPO_ANNOUNCEMENT, tags: [['d', 'repo-1'], ['maintainers', 'a'.repeat(64)], ['clone', 'ssh://git@host/repo-1']] }));
      return 'subX';
    });
    const result = await provider.push({
      refspecs: ['refs/heads/pr/feature-x', 'refs/heads/main'],
      repoAddr: makeRepoAddr('f'.repeat(64), 'repo-1'),
      repoId: 'repo-1',
      url: 'ssh://git@host/repo-1',
      timeoutMs: 10,
    });
    // publish was called at least once with a patch kind
    const publishedKinds = (nostr.publish as any).mock.calls.map((c: any[]) => c[0].kind);
    expect(publishedKinds).toContain(GIT_PATCH);
    // server push called with only the normal ref
    expect((git.push as any).mock.calls[0][0].refspecs).toEqual(['refs/heads/main']);
    expect(result.patchEventIds?.length).toBe(1);
  });

  it('merge emits status events when configured', async () => {
    const provider = new NostrGitProvider(git as GitProvider, nostr as any);
    await provider.merge({
      nostrStatus: {
        repoAddr: makeRepoAddr('f'.repeat(64), 'repo-1'),
        rootId: 'root-evt',
      },
    });
    const publishedKinds = (nostr.publish as any).mock.calls.map((c: any[]) => c[0].kind);
    expect(publishedKinds).toContain(GIT_STATUS_APPLIED);
  });

  it('protocol preference store is used on clone', async () => {
    const provider = new NostrGitProvider(git as GitProvider, nostr as any);
    const set = vi.fn();
    const get = vi.fn(() => 'ssh://git@host/repo-1');
    provider.configureProtocolPrefsStore({ get, set });
    (nostr.subscribe as any).mockImplementation((filter: any, cb: (e: NostrEvent) => void) => {
      cb(makeEvent({ kind: GIT_REPO_ANNOUNCEMENT, tags: [['d', 'repo-1'], ['clone', 'https://host/repo-1', 'ssh://git@host/repo-1']] }));
      return 'sub';
    });
    await provider.clone({ repoId: 'repo-1', dir: '/tmp/repo', timeoutMs: 10 });
    expect(git.clone).toHaveBeenCalledWith(expect.objectContaining({ url: 'ssh://git@host/repo-1' }));
    expect(set).toHaveBeenCalledWith('repo-1', 'ssh://git@host/repo-1');
  });
});
