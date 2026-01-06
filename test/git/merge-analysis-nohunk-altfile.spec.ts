import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import type { GitProvider } from '../../src/git/provider.js';
import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

function minimalNoHunkDiff(filepath: string): string {
  return [
    `diff --git a/${filepath} b/${filepath}`,
    `--- a/${filepath}`,
    `+++ b/${filepath}`,
    ''
  ].join('\n');
}

describe('git/merge-analysis: no-hunk alt-file stays clean', () => {
  it('treats filename-only diff as clean when target modified a different file', async () => {
    const fs = createTestFs('merge-nohunk-altfile');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-nohunk-altfile';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'NHA', email: 'nha@example.com' } };
    await initRepo(h, 'base');
    const base = await commitFile(h, '/a.txt', 'base\n', 'base');

    // Create target branch and modify a different file (b.txt)
    const { createBranch } = await import('../utils/git-harness.js');
    await createBranch(h, 'main', true);
    await commitFile(h, '/b.txt', 'other-change\n', 'target');

    const patch: any = {
      id: 'nh-alt',
      commits: [{ oid: base, message: 'base', author: { name: 'NHA', email: 'nha@example.com' } }],
      baseBranch: 'base',
      raw: { content: minimalNoHunkDiff('a.txt') },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');
    expect(['clean', 'up-to-date']).toContain(res.analysis);
    if ((res as any).hasConflicts !== undefined) {
      expect((res as any).hasConflicts).toBe(false);
    }
  });
});
