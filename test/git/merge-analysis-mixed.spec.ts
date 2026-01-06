import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import type { GitProvider } from '../../src/git/provider.js';
import { analyzePatchMergeability } from '../../src/git/merge-analysis.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

function hunkDiff(filepath: string, oldLine: string, newLine: string): string {
  return [
    `diff --git a/${filepath} b/${filepath}`,
    `index 0000000..1111111 100644`,
    `--- a/${filepath}`,
    `+++ b/${filepath}`,
    `@@ -1 +1 @@`,
    `-${oldLine}`,
    `+${newLine}`,
    ''
  ].join('\n');
}

function filenameOnlyDiff(filepath: string): string {
  return [
    `diff --git a/${filepath} b/${filepath}`,
    `--- a/${filepath}`,
    `+++ b/${filepath}`,
    ''
  ].join('\n');
}

describe('git/merge-analysis: mixed patch (hunk + filename-only) conflict aggregation', () => {
  it('reports conflicts for filename-only file modified in target while allowing clean hunk file', async () => {
    const fs = createTestFs('merge-mixed');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const dir = '/repos/merge-mixed';
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'MM', email: 'mm@example.com' } };
    await initRepo(h, 'base');
    // Base branch content
    await commitFile(h, '/a.txt', 'old\n', 'add a');
    await commitFile(h, '/b.txt', 'baseB\n', 'add b');

    // Create target branch and modify b.txt only
    const { createBranch } = await import('../utils/git-harness.js');
    await createBranch(h, 'main', true);
    await commitFile(h, '/b.txt', 'targetB\n', 'change b in target');

    const raw = [
      hunkDiff('a.txt', 'old', 'new'),
      filenameOnlyDiff('b.txt'),
    ].join('\n');

    const patch: any = {
      id: 'mixed',
      commits: [{ oid: 'd'.repeat(40), message: 'mixed', author: { name: 'MM', email: 'mm@example.com' } }],
      baseBranch: 'base',
      raw: { content: raw },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, dir, patch, 'main');
    expect(res.analysis).toBe('conflicts');
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['b.txt']));
    // a.txt should not be listed as conflict because target didn't modify it
    expect(res.conflictFiles).not.toEqual(expect.arrayContaining(['a.txt']));
  });
});
