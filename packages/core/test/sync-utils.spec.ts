import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitProvider } from '@nostr-git/git-wrapper';
import { needsUpdateUtil, syncWithRemoteUtil } from '../src/lib/workers/sync.js';

function makeGit(overrides: Partial<GitProvider> = {}): GitProvider {
  return {
    listServerRefs: vi.fn(async () => []),
    listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]),
    fetch: vi.fn(async () => {}),
    resolveRef: vi.fn(async () => 'deadbeef'),
    listBranches: vi.fn(async () => ['main']),
    ...overrides,
  } as any;
}

const cache = (headCommit = 'abcd', lastUpdated = Date.now()) => ({
  repoId: 'org/repo',
  headCommit,
  lastUpdated,
  dataLevel: 'shallow' as const,
  branches: [],
  cloneUrls: ['https://example.com/repo.git']
});

describe('needsUpdateUtil', () => {
  it('returns false when no cache and remote has no refs (empty)', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => []) });
    const res = await needsUpdateUtil(git, 'org/repo', ['https://example.com/repo.git'], null, Date.now());
    expect(res).toBe(false);
  });

  it('returns true when no cache and remote has heads', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => [{ ref: 'refs/heads/main', oid: '1' }]) });
    const res = await needsUpdateUtil(git, 'org/repo', ['https://example.com/repo.git'], null, Date.now());
    expect(res).toBe(true);
  });

  it('returns true when cache is stale', async () => {
    const git = makeGit();
    const stale = Date.now() - (61 * 60 * 1000);
    const res = await needsUpdateUtil(git, 'org/repo', ['https://example.com/repo.git'], cache('abcd', stale), Date.now());
    expect(res).toBe(true);
  });

  it('compares main/master with cache head', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => [{ ref: 'refs/heads/main', oid: 'ef01' }]) });
    const res = await needsUpdateUtil(git, 'org/repo', ['https://example.com/repo.git'], cache('abcd'), Date.now());
    expect(res).toBe(true);
  });
});

describe('syncWithRemoteUtil', () => {
  const deps = {
    rootDir: '/tmp',
    canonicalRepoKey: (s: string) => s,
    resolveRobustBranch: async (_dir: string, requested?: string) => requested || 'main',
    isRepoCloned: async (_dir: string) => true,
    toPlain: <T>(v: T) => JSON.parse(JSON.stringify(v)) as T,
  };

  it('fetches and updates cache with remote head', async () => {
    const git = makeGit({
      resolveRef: vi.fn(async () => 'cafebabe'),
      listBranches: vi.fn(async () => ['main', 'dev']),
    });
    const cacheManager = { setRepoCache: vi.fn(async () => {}) } as any;

    const res = await syncWithRemoteUtil(git, cacheManager, { repoId: 'Org/Repo', cloneUrls: ['https://example.com/repo.git'] }, deps);
    expect(res.success).toBe(true);
    expect(cacheManager.setRepoCache).toHaveBeenCalled();
  });

  it('returns error if repo not cloned', async () => {
    const git = makeGit();
    const cacheManager = { setRepoCache: vi.fn(async () => {}) } as any;
    const localDeps = { ...deps, isRepoCloned: async () => false };
    const res = await syncWithRemoteUtil(git, cacheManager, { repoId: 'Org/Repo', cloneUrls: ['https://example.com/repo.git'] }, localDeps);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not cloned/i);
  });
});
