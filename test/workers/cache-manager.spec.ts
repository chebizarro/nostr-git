import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { RepoCacheManager, type RepoCache } from '../../src/worker/workers/cache.js';

describe('RepoCacheManager (IndexedDB)', () => {
  let mgr: RepoCacheManager;

  beforeEach(async () => {
    // Reset database by creating a new instance each time
    mgr = new RepoCacheManager();
    await mgr.init();
  });

  it('setRepoCache/getRepoCache round-trip', async () => {
    const cache: RepoCache = {
      repoId: 'owner:repo',
      lastUpdated: Date.now(),
      headCommit: '0123456789abcdef0123456789abcdef01234567',
      dataLevel: 'refs',
      branches: [
        { name: 'main', commit: '0123456789abcdef0123456789abcdef01234567' },
        { name: 'feature', commit: '89abcdef0123456789abcdef0123456789abcdef' },
      ],
      cloneUrls: ['https://example.com/owner/repo.git'],
      tags: [
        { name: 'v1.0.0', commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      ],
    };

    await mgr.setRepoCache(cache);
    const read = await mgr.getRepoCache('owner:repo');
    expect(read?.repoId).toBe(cache.repoId);
    expect(read?.headCommit).toBe(cache.headCommit);
    expect(read?.branches?.length).toBe(2);
    expect(read?.tags?.[0]?.name).toBe('v1.0.0');
  });

  it('mergeAnalysis: set/get/delete', async () => {
    const repoId = 'owner:repo';
    const patchId = 'patch-123';
    const targetBranch = 'main';

    // get before set should be null
    const before = await mgr.getMergeAnalysis(repoId, patchId, targetBranch);
    expect(before).toBeNull();

    const result = { status: 'clean', mergeBase: 'deadbeef', conflicts: [] } as any;
    await mgr.setMergeAnalysis(repoId, patchId, targetBranch, result);

    const after = await mgr.getMergeAnalysis(repoId, patchId, targetBranch);
    expect(after).toEqual(result);

    await mgr.deleteMergeAnalysis(repoId, patchId, targetBranch);
    const deleted = await mgr.getMergeAnalysis(repoId, patchId, targetBranch);
    expect(deleted).toBeNull();
  });
});
