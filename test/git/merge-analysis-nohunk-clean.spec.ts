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

describe('git/merge-analysis: conservative no-hunk clean path', () => {
  it('treats filename-only diff with no target changes as clean/up-to-date', async () => {
    const fs = createTestFs('merge-nohunk-clean');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-nohunk-clean';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'NHC', email: 'nhc@example.com' } };
    await initRepo(h, 'base');
    const base = await commitFile(h, '/file.txt', 'line1\nline2\n', 'base');

    // Create target branch without modifying file.txt
    const { createBranch } = await import('../utils/git-harness.js');
    await createBranch(h, 'main', true);

    const patch: any = {
      id: 'nhc',
      commits: [{ oid: base, message: 'base', author: { name: 'NHC', email: 'nhc@example.com' } }],
      baseBranch: 'base',
      raw: { content: minimalNoHunkDiff('file.txt') },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');
    expect(['clean', 'up-to-date']).toContain(res.analysis);
    if ((res as any).hasConflicts !== undefined) {
      expect((res as any).hasConflicts).toBe(false);
    }
  });
});
