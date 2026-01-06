import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { smartInitializeRepoUtil } from '../../src/worker/workers/repos.js';

function makeGitMock() {
  return {
    fetch: vi.fn(),
    resolveRef: vi.fn(),
    writeRef: vi.fn(),
    listBranches: vi.fn(),
    listRemotes: vi.fn(),
    checkout: vi.fn(),
  } as any;
}

function makeCacheManagerMock() {
  return {
    getRepoCache: vi.fn(),
    setRepoCache: vi.fn(),
  } as any;
}

describe('worker: smartInitializeRepoUtil branch/repo flows', () => {
  const rootDir = '/tmp';
  const canonicalRepoKey = (id: string) => id.replace(/[^a-z0-9_-]/gi, '_');
  const repoDataLevels = new Map<string, 'refs' | 'shallow' | 'full'>();
  const clonedRepos = new Set<string>();
  const isRepoCloned = vi.fn().mockResolvedValue(true);
  const sendProgress = vi.fn();

  let git: any;
  let cacheManager: any;

  beforeEach(() => {
    git = makeGitMock();
    cacheManager = makeCacheManagerMock();
    repoDataLevels.clear();
    clonedRepos.clear();
    sendProgress.mockReset();
    isRepoCloned.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs existing clone, writes branch refs, caches shallow by default', async () => {
    const resolveRobustBranch = vi.fn().mockResolvedValue('main');
    git.fetch.mockResolvedValue(undefined);
    git.resolveRef.mockResolvedValueOnce('abc123'); // for remote ref
    git.writeRef.mockResolvedValue(undefined);
    git.listBranches.mockResolvedValue(['main']);

    const result = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId: 'team/repo', cloneUrls: ['https://example/repo.git'] },
      { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos, isRepoCloned, resolveRobustBranch },
      sendProgress
    );

    expect((result as any).success).toBe(true);
    expect((result as any).synced).toBe(true);
    expect((result as any).headCommit).toBe('abc123');
    expect((result as any).dataLevel).toBe('shallow');
    expect((result as any).branches?.[0]).toMatchObject({ name: 'main', commit: 'abc123' });
    expect(cacheManager.setRepoCache).toHaveBeenCalled();
  });

  it('handles empty repositories by returning refs-only success with warning', async () => {
    const resolveRobustBranch = vi.fn().mockRejectedValue(new Error('no branches'));
    // fetch is attempted but allowed to be undefined
    git.fetch.mockResolvedValue(undefined);

    const result = await smartInitializeRepoUtil(
      git,
      cacheManager,
      // Use empty cloneUrls to minimize side effects and ensure early branch handling
      { repoId: 'team/empty', cloneUrls: [] },
      { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos, isRepoCloned, resolveRobustBranch },
      sendProgress
    );

    expect((result as any).success).toBe(true);
    expect((result as any).dataLevel).toBe('refs');
    expect((result as any).warning).toMatch(/no branches/i);
    expect((result as any).serializable).toBe(true);
  });

  it('propagates non-network fetch errors as failure result', async () => {
    const resolveRobustBranch = vi.fn();
    git.fetch.mockRejectedValue(new Error('fatal: remote error'));
    // initializeRepoUtil will be attempted; ensure git.clone exists and throws same fatal error
    (git as any).clone = vi.fn().mockRejectedValue(new Error('fatal: remote error'));

    const result = await smartInitializeRepoUtil(
      git,
      cacheManager,
      { repoId: 'team/fail', cloneUrls: ['https://example/fail.git'] },
      { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos, isRepoCloned, resolveRobustBranch },
      sendProgress
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toMatch(/fatal/);
  });

  it('ensureShallowCloneUtil fetches requested branch and sets shallow level', async () => {
    const { ensureShallowCloneUtil } = await import('../../src/worker/workers/repos.js');
    const resolveRobustBranch = vi.fn().mockResolvedValue('feature');
    git.listRemotes.mockResolvedValue([{ remote: 'origin', url: 'https://example/repo.git' }]);
    git.fetch.mockResolvedValue(undefined);
    git.checkout.mockResolvedValue(undefined);
    const repoId = 'team/repo';
    const key = canonicalRepoKey(repoId);
    clonedRepos.add(key);

    const res = await ensureShallowCloneUtil(
      git,
      { repoId, branch: 'feature' },
      { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos, isRepoCloned, resolveRobustBranch },
      sendProgress
    );

    expect((res as any).success).toBe(true);
    expect((res as any).branch).toBe('feature');
    expect(repoDataLevels.get(key)).toBe('shallow');
    const fetchInit = git.fetch.mock.calls[0][0];
    expect(fetchInit.ref).toBe('feature');
    expect(fetchInit.depth).toBe(1);
  });
});
