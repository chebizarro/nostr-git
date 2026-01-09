import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import type { GitProvider } from '../../src/git/provider.js';
import { analyzePatchMergeUtil } from '../../src/worker/workers/patches.js';
import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';

import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { initRepo, commitFile, createBranch, checkout, getHeadOid } from '../utils/git-harness.js';

function diffModifyLine1(oldLine: string, newLine: string): string {
  return [
    'diff --git a/file.txt b/file.txt',
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1,2 +1,2 @@',
    `-${oldLine}`,
    `+${newLine}`,
    ' line2'
  ].join('\\n');
}

describe('worker/patches: analyzePatchMergeUtil', () => {
  it('clean/fast-forward scenario: canMerge true and analysis is clean', async () => {
    const fs = createTestFs('patches-analyze-clean');
    const remoteRegistry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/file.txt', 'line1\\nline2\\n', 'base');

    await createBranch(h, 'patch', true);
    const patchCommit = await commitFile(h, '/file.txt', 'line1 patched\\nline2\\n', 'patch change');

    // Back to main for target
    await checkout(h, 'main');
    const targetHead = await getHeadOid(h, 'HEAD');
    expect(targetHead).toBeTruthy();

    const res = await analyzePatchMergeUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-evt-1',
          commits: [
            { oid: patchCommit, message: 'patch change', author: { name: 'Test', email: 't@example.com' } }
          ],
          baseBranch: 'main',
          rawContent: diffModifyLine1('line1', 'line1 patched')
        },
        targetBranch: undefined
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (_d, requested) => requested || 'main',
        analyzePatchMergeability
      }
    );

    expect(res.canMerge).toBe(true);
    expect(res.analysis === 'clean' || res.analysis === 'up-to-date' || res.analysis === 'conflicts' || res.analysis === 'diverged' || res.analysis === 'error').toBe(true);
    // In this topology merge-analysis may report fastForward as clean
    expect(res.analysis).toBe('clean');
  });

  it('conflict scenario: detects conflicts when target changed since base branch', async () => {
    const fs = createTestFs('patches-analyze-conflict');
    const remoteRegistry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'base');
    await commitFile(h, '/file.txt', 'line1\\nline2\\n', 'base');

    // main diverges from base
    await createBranch(h, 'main', true);
    await commitFile(h, '/file.txt', 'line1 main\\nline2\\n', 'main change');

    // patch branch from base modifies same region
    await checkout(h, 'base');
    await createBranch(h, 'patch', true);
    const patchCommit = await commitFile(h, '/file.txt', 'line1 patched\\nline2\\n', 'patch change');

    const res = await analyzePatchMergeUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-evt-2',
          commits: [
            { oid: patchCommit, message: 'patch change', author: { name: 'Test', email: 't@example.com' } }
          ],
          baseBranch: 'base',
          rawContent: diffModifyLine1('line1', 'line1 patched')
        },
        targetBranch: 'main'
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (_d, requested) => requested || 'main',
        analyzePatchMergeability
      }
    );

    expect(res.canMerge).toBe(false);
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['file.txt']));
    expect(res.analysis).toBe('conflicts');
  });

  it('uses baseBranch fallback when targetBranch is not provided', async () => {
    const fs = createTestFs('patches-analyze-base-fallback');
    const remoteRegistry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/file.txt', 'line1\\nline2\\n', 'base');

    await createBranch(h, 'patch', true);
    const patchCommit = await commitFile(h, '/file.txt', 'line1 patched\\nline2\\n', 'patch change');

    const res = await analyzePatchMergeUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-evt-3',
          commits: [
            { oid: patchCommit, message: 'patch change', author: { name: 'Test', email: 't@example.com' } }
          ],
          baseBranch: 'main',
          rawContent: diffModifyLine1('line1', 'line1 patched')
        }
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (_d, requested) => requested || 'main',
        analyzePatchMergeability
      }
    );

    expect(res.analysis).toBeTruthy();
  });

  it('returns analysis:error when patchData.rawContent is invalid (non-string)', async () => {
    const fs = createTestFs('patches-analyze-rawContent-error');
    const remoteRegistry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    const baseCommit = await commitFile(h, '/file.txt', 'line1\\nline2\\n', 'base');

    const res = await analyzePatchMergeUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-evt-4',
          commits: [{ oid: baseCommit, message: 'base', author: { name: 'Test', email: 't@example.com' } }],
          baseBranch: 'main',
          rawContent: null as any
        }
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (_d, requested) => requested || 'main',
        analyzePatchMergeability
      }
    );

    expect(res.analysis).toBe('error');
    expect(String(res.errorMessage || '')).toContain('error');
  });
});