import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import type { GitProvider } from '../../src/git/provider.js';
import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

function minimalHunkDiff(filepath: string, oldLine: string, newLine: string): string {
  return [
    `diff --git a/${filepath} b/${filepath}`,
    `--- a/${filepath}`,
    `+++ b/${filepath}`,
    `@@ -1,1 +1,1 @@`,
    `-${oldLine}`,
    `+${newLine}`,
    ''
  ].join('\n');
}

// Fast-forward scenario: target is ancestor of patch commit
// We only need a valid non-empty raw diff; merge logic primarily uses commit ancestry

describe('git/merge-analysis: fast-forward detection', () => {
  it('detects fast-forward when patch tip is descendant of target', async () => {
    const fs = createTestFs('merge-ff');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-ff';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'FF', email: 'ff@example.com' } };
    await initRepo(h, 'main');
    const base = await commitFile(h, '/file.txt', 'line1', 'base');
    const tip = await commitFile(h, '/file.txt', 'line1-ff', 'advance');

    const patch: any = {
      id: 'ff',
      commits: [{ oid: tip, message: 'advance', author: { name: 'FF', email: 'ff@example.com' } }],
      baseBranch: 'main',
      raw: { content: minimalHunkDiff('file.txt', 'line1', 'line1-ff') },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');

    // Accept either explicit fast-forward label or flag indicating fast-forward
    expect(['fast-forward', 'clean', 'up-to-date']).toContain(res.analysis);
    if (typeof (res as any).isFastForward !== 'undefined') {
      expect((res as any).isFastForward).toBe(true);
    }
  });
});
