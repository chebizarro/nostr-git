import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '../../src/git/provider.js';
import { needsUpdateUtil, syncWithRemoteUtil } from '../../src/worker/workers/sync.js';

function makeGit(overrides: Partial<GitProvider> = {}): GitProvider {
  return {
    listServerRefs: vi.fn(async () => []) as any,
    listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
    fetch: vi.fn(async () => undefined) as any,
    listBranches: vi.fn(async () => ['main']) as any,
    resolveRef: vi.fn(async ({ ref }: any) => (ref === 'HEAD' ? 'head' : 'abc123')) as any,
    checkout: vi.fn(async () => undefined) as any,
    branch: vi.fn(async () => undefined) as any,
    ...overrides,
  } as unknown as GitProvider;
}

const cacheMgr = () => ({
  getRepoCache: vi.fn(async () => null),
  setRepoCache: vi.fn(async () => undefined),
}) as any;

const depsBase = {
  rootDir: '/tmp/root',
  parseRepoId: (id: string) => id.replace(/\s+/g, '-').toLowerCase(),
  resolveBranchName: async (_dir: string, requested?: string) => requested ?? 'main',
  isRepoCloned: async (_dir: string) => true,
  toPlain: <T,>(v: T) => v,
};

describe('worker/sync utils', () => {
  it('needsUpdateUtil: no cache, empty remote heads -> do not require update', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => []) as any });
    const res = await needsUpdateUtil(git, 'Org/R', ['https://example.com/repo.git'], null, Date.now());
    expect(res).toBe(false);
  });

  it('syncWithRemoteUtil: updates cache branches using heads for local and remote fallback for missing heads', async () => {
    const setSpy = vi.fn(async () => undefined);
    const cache = { getRepoCache: vi.fn(async () => ({ dataLevel: 'shallow' })), setRepoCache: setSpy } as any;
    const git = makeGit({
      fetch: vi.fn(async () => undefined) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
      listBranches: vi.fn(async () => ['main', 'feature']) as any,
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (ref === 'HEAD') return 'localHeadX';
        if (ref === 'refs/remotes/origin/main') return 'remoteMainX';
        if (ref === 'refs/remotes/origin/feature') return 'remoteFeatureX';
        if (ref === 'refs/heads/main') return 'localMainX';
        if (ref === 'refs/heads/feature') throw new Error('no local feature head');
        return 'localHeadX';
      }) as any,
      branch: vi.fn(async () => undefined) as any,
      checkout: vi.fn(async () => undefined) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/Branches', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect(setSpy).toHaveBeenCalled();
    const arg = (setSpy as any).mock.calls[0][0];
    const branches = (arg as any).branches as Array<{ name: string; commit: string }>;
    const main = branches.find((b) => b.name === 'main');
    const feature = branches.find((b) => b.name === 'feature');
    expect(main?.commit).toBe('localMainX');
    expect(feature?.commit).toBe('remoteFeatureX');
  });

  it('syncWithRemoteUtil: empty local branches still updates cache with headCommit and synced=true', async () => {
    const setSpy = vi.fn(async () => undefined);
    const cache = { getRepoCache: vi.fn(async () => ({ dataLevel: 'refs' })), setRepoCache: setSpy } as any;
    const git = makeGit({
      fetch: vi.fn(async () => undefined) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
      listBranches: vi.fn(async () => []) as any,
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (ref === 'refs/remotes/origin/main') return 'remoteHeadY';
        if (ref === 'HEAD') return 'localHeadY';
        return 'localHeadY';
      }) as any,
      branch: vi.fn(async () => undefined) as any,
      checkout: vi.fn(async () => undefined) as any,
    });

    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/EmptyBranches', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect((res as any).synced).toBe(true);
    const arg = (setSpy as any).mock.calls[0][0];
    expect((arg as any).headCommit).toBe('remoteHeadY');
    expect(Array.isArray((arg as any).branches)).toBe(true);
    expect(((arg as any).branches as any[]).length).toBe(0);
  });

  it('syncWithRemoteUtil: CORS/network fetch error returns success with warning and synced=false', async () => {
    const cache = cacheMgr();
    const git = makeGit({
      fetch: vi.fn(async () => { throw new Error('CORS: Access-Control blocked'); }) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/Cors', cloneUrls: ['https://example.com/repo.git'], branch: 'feature' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect((res as any).synced).toBe(false);
    expect(String((res as any).warning || '')).toMatch(/CORS|network/i);
  });

  it('syncWithRemoteUtil: no remote URL available returns error', async () => {
    const cache = cacheMgr();
    const git = makeGit({
      listRemotes: vi.fn(async () => []) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/NoRemote', cloneUrls: [], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/No remote URL available/i);
  });

  it('syncWithRemoteUtil: preserves existing cache dataLevel when updating cache', async () => {
    const cache = {
      getRepoCache: vi.fn(async () => ({ dataLevel: 'full' })),
      setRepoCache: vi.fn(async () => undefined),
    } as any;
    const git = makeGit({
      fetch: vi.fn(async () => undefined) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
      listBranches: vi.fn(async () => ['main']) as any,
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (ref === 'HEAD') return 'localHead';
        if (String(ref).startsWith('refs/remotes/')) return 'remoteHead';
        return 'localHead';
      }) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/DataLevel', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect(cache.setRepoCache).toHaveBeenCalled();
    const setArg = (cache.setRepoCache as any).mock.calls[0][0];
    expect(setArg.dataLevel).toBe('full');
  });

  it('syncWithRemoteUtil: handles branch creation failure and checkout error gracefully', async () => {
    const cache = cacheMgr();
    const git = makeGit({
      fetch: vi.fn(async () => undefined) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
      listBranches: vi.fn(async () => []) as any,
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (String(ref).startsWith('refs/remotes/')) throw new Error('no tracking');
        if (ref === 'HEAD') return 'localHead2';
        return 'localHead2';
      }) as any,
      branch: vi.fn(async () => { throw new Error('branch create fail'); }) as any,
      checkout: vi.fn(async () => { throw new Error('checkout failed'); }) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/CheckoutCatch', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect(cache.setRepoCache).toHaveBeenCalled();
  });

  it('syncWithRemoteUtil: falls back to HEAD when tracking ref missing', async () => {
    const cache = cacheMgr();
    const git = makeGit({
      fetch: vi.fn(async () => undefined) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
      listBranches: vi.fn(async () => ['main']) as any,
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (String(ref).startsWith('refs/remotes/')) throw new Error('no tracking');
        if (ref === 'HEAD') return 'localHead';
        return 'localHead';
      }) as any,
      branch: vi.fn(async () => undefined) as any,
      checkout: vi.fn(async () => undefined) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/HeadFallback', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    // No tracking ref, so remote HEAD fell back to local HEAD; synced state may still be true
    expect(cache.setRepoCache).toHaveBeenCalled();
  });

  it('syncWithRemoteUtil: not-cloned error path returns success=false with message', async () => {
    const git = makeGit();
    const res = await syncWithRemoteUtil(
      git,
      cacheMgr(),
      { repoId: 'Org/R', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => false,
      }
    );
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/not cloned|Clone first/i);
  });

  it('syncWithRemoteUtil: happy path fetches, checks out, and updates cache', async () => {
    const cache = cacheMgr();
    const git = makeGit({
      fetch: vi.fn(async () => undefined) as any,
      listRemotes: vi.fn(async () => [{ remote: 'origin', url: 'https://example.com/repo.git' }]) as any,
      listBranches: vi.fn(async () => ['main']) as any,
      resolveRef: vi.fn(async ({ ref }: any) => {
        if (ref === 'HEAD') return 'localHead';
        if (String(ref).startsWith('refs/remotes/')) return 'remoteHead';
        return 'localHead';
      }) as any,
      branch: vi.fn(async () => undefined) as any,
      checkout: vi.fn(async () => undefined) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cache,
      { repoId: 'Org/Ok', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect((res as any).synced).toBe(true);
    expect(cache.setRepoCache).toHaveBeenCalled();
  });

  it('needsUpdateUtil: no cache, probe fails (network) -> allow initial push (no update)', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => { throw new Error('CORS'); }) as any });
    const res = await needsUpdateUtil(git, 'Org/R', ['https://example.com/repo.git'], null, Date.now());
    expect(res).toBe(false);
  });

  it('needsUpdateUtil: stale cache triggers update', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => [{ ref: 'refs/heads/main', oid: 'x' }]) as any });
    const old = Date.now() - (61 * 60 * 1000);
    const res = await needsUpdateUtil(git, 'Org/R', ['https://example.com/repo.git'], { lastUpdated: old } as any, Date.now());
    expect(res).toBe(true);
  });

  it('needsUpdateUtil: fresh cache with remote refs still indicates update', async () => {
    const git = makeGit({ listServerRefs: vi.fn(async () => [{ ref: 'refs/heads/main', oid: 'x' }]) as any });
    const fresh = Date.now();
    const res = await needsUpdateUtil(git, 'Org/R', ['https://example.com/repo.git'], { lastUpdated: fresh } as any, Date.now());
    expect(res).toBe(true);
  });

  it('syncWithRemoteUtil: CORS fetch error path returns warning and success=false synced state', async () => {
    const git = makeGit({
      fetch: vi.fn(async () => { const e: any = new Error('Access-Control'); throw e; }) as any,
    });
    const res = await syncWithRemoteUtil(
      git,
      cacheMgr(),
      { repoId: 'Org/R', cloneUrls: ['https://example.com/repo.git'], branch: 'main' },
      {
        ...depsBase,
        isRepoCloned: async () => true,
      }
    );
    expect(res.success).toBe(true);
    expect((res as any).warning).toMatch(/CORS|network/i);
    expect((res as any).synced).toBe(false);
  });
});
