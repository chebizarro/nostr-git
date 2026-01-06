import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitProvider } from '../../src/git/provider.js';
import { smartInitializeRepoUtil, ensureShallowCloneUtil, ensureFullCloneUtil, clearCloneTracking, cloneRemoteRepoUtil } from '../../src/worker/workers/repos.js';

const canonicalRepoKey = (id: string) => id.replace(/\s+/g, '-').toLowerCase();

function makeGitMock(partial: Partial<GitProvider> = {}): GitProvider {
  return {
    // clone/init
    clone: vi.fn().mockResolvedValue(undefined),
    listBranches: vi.fn().mockResolvedValue(['main']),
    resolveRef: vi.fn().mockResolvedValue('abcdef1234567890'),
    // fetch/checkout
    listRemotes: vi
      .fn()
      .mockResolvedValue([{ remote: 'origin', url: 'https://example.com/repo.git' }]),
    fetch: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    // write and others
    writeRef: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue([]),
    statusMatrix: vi.fn().mockResolvedValue([] as any),
    ...partial,
  } as unknown as GitProvider;
}

function makeCacheMock(initial?: any) {
  let stored: any = initial ?? null;
  return {
    getRepoCache: vi.fn(async (key: string) => (stored && stored.repoId === key ? stored : null)),
    setRepoCache: vi.fn(async (value: any) => {
      stored = value;
      return undefined;
    }),
    clearOldCache: vi.fn(async () => undefined),
    deleteRepoCache: vi.fn(async () => undefined),
  } as any;
}

const rootDir = '/tmp/root';

describe('repos utils (additional coverage)', () => {
  let git: GitProvider;
  let cacheManager: any;
  let repoDataLevels: Map<string, 'refs' | 'shallow' | 'full'>;
  let clonedRepos: Set<string>;

  beforeEach(() => {
    git = makeGitMock();
    cacheManager = makeCacheMock();
    repoDataLevels = new Map();
    clonedRepos = new Set();
  });

  it('cloneRemoteRepoUtil: happy path clones and writes cache', async () => {
    // Provide a git mock with listServerRefs to satisfy discovery
    const gitHappy = makeGitMock({
      // listServerRefs used by cloneRemoteRepoUtil to validate remote
      listServerRefs: vi.fn(async () => [{ ref: 'refs/heads/main', oid: 'abcd' }]) as any,
    } as any);
    const cacheMgr: any = { init: vi.fn(async () => {}), setRepoCache: vi.fn(async () => {}) };
    await cloneRemoteRepoUtil(
      gitHappy as any,
      cacheMgr,
      { url: 'https://example.com/owner/repo.git', dir: '/tmp/root/clone-ok', depth: 1 }
    );
    expect(cacheMgr.init).toHaveBeenCalled();
    expect(cacheMgr.setRepoCache).toHaveBeenCalled();
  });

  it('cloneRemoteRepoUtil: invalid URL fails early with helpful error', async () => {
    const cacheMgr: any = { init: vi.fn(async () => {}), setRepoCache: vi.fn(async () => {}) };
    await expect(
      cloneRemoteRepoUtil(
        git as any,
        cacheMgr,
        { url: 'not a url', dir: '/tmp/root/invalid', depth: 1 }
      )
    ).rejects.toThrow(/Invalid repository URL/i);
  });

  it('ensureFullCloneUtil: missing origin remote error', async () => {
    const repoId = 'X/FullNoOrigin';
    const key = canonicalRepoKey(repoId);
    clonedRepos.add(key);
    (git.listRemotes as any) = vi.fn(async () => []);
    const res = await ensureFullCloneUtil(
      git,
      { repoId, branch: 'main', depth: 20 },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      } as any,
      () => {}
    );
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/Origin remote not found/i);
  });

  it('smartInitializeRepoUtil: forceUpdate bypasses cache and re-initializes', async () => {
    const repoId = 'Org/ForceUpdate';
    const key = canonicalRepoKey(repoId);
    // Seed cache that would normally short-circuit
    const cached = {
      repoId: key,
      lastUpdated: Date.now(),
      headCommit: 'deadbeef',
      dataLevel: 'refs' as const,
      branches: [{ name: 'main', commit: 'deadbeef' }],
      cloneUrls: ['https://example.com/repo.git']
    };
    cacheManager = makeCacheMock(cached);

    const res = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls: ['https://example.com/repo.git'], forceUpdate: true },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => false,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );

    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    expect((res as any).fromCache).toBe(false);
    expect((res as any).dataLevel).toBe('refs');
  });

  it('ensureFullCloneUtil: cached full path returns cached=true', async () => {
    const repoId = 'X/FullCached';
    const key = canonicalRepoKey(repoId);
    repoDataLevels.set(key, 'full');
    clonedRepos.add(key);
    const res = await ensureFullCloneUtil(
      git,
      { repoId, branch: 'main', depth: 50 },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      } as any,
      () => {}
    );
    expect(res.success).toBe(true);
    expect((res as any).cached).toBe(true);
  });

  it('ensureFullCloneUtil: success path updates dataLevel to full', async () => {
    const repoId = 'X/FullSuccess';
    const key = canonicalRepoKey(repoId);
    const res = await ensureFullCloneUtil(
      git,
      { repoId, branch: 'main', depth: 50 },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      } as any,
      () => {}
    );
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    expect((res as any).level).toBe('full');
    expect(repoDataLevels.get(key)).toBe('full');
  });

  it('ensureShallowCloneUtil: success path sets shallow level', async () => {
    const repoId = 'X/ShallowSuccess';
    const key = canonicalRepoKey(repoId);
    clonedRepos.add(key);
    const res = await ensureShallowCloneUtil(
      git,
      { repoId, branch: 'main' },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      } as any,
      () => {}
    );
    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    expect((res as any).dataLevel).toBe('shallow');
    expect(repoDataLevels.get(key)).toBe('shallow');
  });

  it('ensureShallowCloneUtil: missing origin remote throws', async () => {
    const repoId = 'X/ShallowNoOrigin';
    const key = canonicalRepoKey(repoId);
    clonedRepos.add(key);
    // listRemotes returns empty
    (git.listRemotes as any) = vi.fn(async () => []);
    const res = await ensureShallowCloneUtil(
      git,
      { repoId, branch: 'main' },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      } as any,
      () => {}
    );
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/Origin remote not found/i);
  });

  it('ensureShallowCloneUtil: returns from cache when level already shallow', async () => {
    const repoId = 'Org/CachedShallow';
    const key = canonicalRepoKey(repoId);
    repoDataLevels.set(key, 'shallow');
    const res = await ensureShallowCloneUtil(
      git,
      { repoId, branch: 'main' },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => true,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(true);
    expect((res as any).fromCache).toBe(true);
  });

  it('clearCloneTracking clears tracking sets', () => {
    const repoDataLevelsLocal = new Map<string, 'refs' | 'shallow' | 'full'>([['a', 'refs']]);
    const clonedReposLocal = new Set<string>(['a']);
    clearCloneTracking(clonedReposLocal, repoDataLevelsLocal as any);
    expect(clonedReposLocal.size).toBe(0);
    expect(repoDataLevelsLocal.size).toBe(0);
  });

  it('smartInitializeRepoUtil: propagate failure when initialize fallback fails', async () => {
    const repoId = 'Org/FallbackInitFail';
    const isRepoCloned = async () => true;
    const resolveRobustBranch = async () => 'main';

    // Non-CORS fetch error to force fallback into initializeRepoUtil
    (git.fetch as any) = vi.fn(async () => { throw new Error('server 500'); });
    // Make clone fail inside initializeRepoUtil
    (git.clone as any) = vi.fn(async () => { throw new Error('clone failed'); });

    const res = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls: ['https://example.com/repo.git'] },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned,
        resolveRobustBranch,
      },
      () => {}
    );

    expect(res.success).toBe(false);
    if (res.success) throw new Error('unexpected success');
    expect((res as any).error).toMatch(/clone failed|All clone URLs failed|server 500/i);
  });

  it('smartInitializeRepoUtil: falls back to HEAD when remoteRef resolve fails', async () => {
    const repoId = 'Org/FallbackHead';
    const isRepoCloned = async () => true;
    const resolveRobustBranch = async () => 'main';

    // First resolveRef call for remoteRef throws; next for HEAD succeeds
    const originalResolve = git.resolveRef as any;
    (git.resolveRef as any) = vi.fn(async (args: any) => {
      if (args?.ref && String(args.ref).startsWith('refs/remotes/')) {
        throw new Error('no remote ref');
      }
      return 'deadbeef';
    });

    const res = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls: ['https://example.com/repo.git'] },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned,
        resolveRobustBranch,
      },
      () => {}
    );

    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    expect((res as any).synced).toBe(true);

    // restore
    (git.resolveRef as any) = originalResolve;
  });

  it('smartInitializeRepoUtil: already-cloned non-CORS fetch error falls through to initialize flow', async () => {
    const repoId = 'Org/NonCorsFail';
    const key = canonicalRepoKey(repoId);
    const isRepoCloned = async () => true;
    const resolveRobustBranch = async () => 'main';

    // Make fetch throw a non-CORS error to trigger throw and re-init path
    (git.fetch as any) = vi.fn(async () => {
      throw new Error('Some other failure');
    });
    // Make clone succeed during the initializeRepoUtil fallback
    (git.clone as any) = vi.fn(async () => undefined);

    const res = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls: ['https://example.com/repo.git'] },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned,
        resolveRobustBranch,
      },
      () => {}
    );

    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    // either synced true from re-init, or refs level set via initialize path
    expect((res as any).synced === true || (res as any).dataLevel === 'refs').toBe(true);
  });

  it('smartInitializeRepoUtil: already-cloned path with CORS fetch error and empty repo branch resolution', async () => {
    const repoId = 'Owner/EmptyRepo';
    const key = canonicalRepoKey(repoId);

    // Simulate already cloned
    const isRepoCloned = async () => true;
    // Simulate fetch throwing a CORS-like error, should be handled and not thrown
    (git.fetch as any) = vi.fn(async () => {
      const err: any = new Error('CORS: Access-Control blocked');
      throw err;
    });
    // Simulate resolveRobustBranch failing (empty repo)
    const resolveRobustBranch = async () => { throw new Error('no branches'); };

    const res = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls: ['https://example.com/repo.git'] },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned,
        resolveRobustBranch,
      },
      () => {}
    );

    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    expect(res.fromCache).toBe(false);
    // should return limited success with warning for empty repos
    expect((res as any).warning).toMatch(/no branches/i);
    expect((res as any).dataLevel).toBe('refs');
  });

  it('smartInitializeRepoUtil: already-cloned path syncs branch when resolvable', async () => {
    const repoId = 'Org/Normal';
    const key = canonicalRepoKey(repoId);
    const isRepoCloned = async () => true;
    const resolveRobustBranch = async () => 'main';

    const res = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls: ['https://example.com/repo.git'] },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned,
        resolveRobustBranch,
      },
      () => {}
    );

    expect(res.success).toBe(true);
    if (!res.success) throw new Error('unexpected failure');
    expect((res as any).synced).toBe(true);
    expect((git.writeRef as any)).toHaveBeenCalled();
  });

  it('ensureShallowCloneUtil: not initialized error path', async () => {
    const repoId = 'X/Y';
    const res = await ensureShallowCloneUtil(
      git,
      { repoId, branch: 'main' },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => false,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/Repository not initialized/i);
  });

  it('ensureFullCloneUtil: not initialized error path', async () => {
    const repoId = 'X/Z';
    const res = await ensureFullCloneUtil(
      git,
      { repoId, branch: 'main', depth: 50 },
      {
        rootDir,
        canonicalRepoKey,
        repoDataLevels,
        clonedRepos,
        isRepoCloned: async () => false,
        resolveRobustBranch: async () => 'main',
      },
      () => {}
    );
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/Repository not initialized/i);
  });
});
