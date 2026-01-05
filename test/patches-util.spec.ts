import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '../src/git/provider.js';
import { analyzePatchMergeUtil } from '../src/worker/workers/patches.js';
import type { MergeAnalysisResult } from '../src/git/merge-analysis.js';

function makeGit(): GitProvider {
  return {} as any;
}

describe('analyzePatchMergeUtil', () => {
  it('delegates to analyzePatchMergeability with resolved branch', async () => {
    const analyze = vi.fn(async () => ({ canMerge: true }) as any as MergeAnalysisResult);

    const res = await analyzePatchMergeUtil(
      makeGit(),
      {
        repoId: 'Org/Repo',
        patchData: {
          id: 'p1',
          commits: [],
          baseBranch: 'dev',
          rawContent: '--- a\n+++ b\n@@\n+change'
        },
        targetBranch: undefined
      },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s.toLowerCase(),
        resolveRobustBranch: async (_dir, requested) => requested || 'main',
        analyzePatchMergeability: analyze
      }
    );

    expect(res.canMerge).toBe(true);
    expect(analyze).toHaveBeenCalled();
  });

  it('returns error result on exception', async () => {
    const analyze = vi.fn(async () => {
      throw new Error('boom');
    });

    const res = await analyzePatchMergeUtil(
      makeGit(),
      {
        repoId: 'o/r',
        patchData: { id: 'p2', commits: [], baseBranch: 'main', rawContent: '' }
      },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s,
        resolveRobustBranch: async () => 'main',
        analyzePatchMergeability: analyze
      }
    );

    expect(res.canMerge).toBe(false);
    expect(res.analysis).toBe('error');
    expect(res.errorMessage).toBe('boom');
  });
});
