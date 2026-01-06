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

describe('git/merge-analysis: error and conservative paths', () => {
  it('handles missing target ref (bad ref) without crashing', async () => {
    const fs = createTestFs('merge-badref');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-badref';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    const base = await commitFile(h, '/file.txt', 'line1\nline2\n', 'base');

    const patch: any = {
      id: 'badref',
      commits: [{ oid: base, message: 'base', author: { name: 'T', email: 't@example.com' } }],
      baseBranch: 'main',
      raw: { content: minimalNoHunkDiff('file.txt') },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'no-such-branch');

    // Implementation may fallback and report up-to-date, or surface an error; both are acceptable as long as it doesn't crash
    expect(['error', 'up-to-date', 'clean']).toContain(res.analysis);
  });

  it('returns error when raw patch content is empty', async () => {
    const fs = createTestFs('merge-empty');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-empty';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');

    const patch: any = {
      id: 'empty',
      commits: [],
      baseBranch: 'main',
      raw: { content: '' },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');
    expect(res.analysis).toBe('error');
  });

  it('marks conflict conservatively when base/target changed and diff has no chunks', async () => {
    const fs = createTestFs('merge-conservative');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-cons';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'base');
    await commitFile(h, '/file.txt', 'line1\nline2\n', 'base');

    // target branch modifies file
    await (await import('../utils/git-harness.js')).createBranch(h, 'main', true);
    await commitFile(h, '/file.txt', 'line1 main\nline2\n', 'main change');

    // patch diff references same file but has no hunks (parser yields no chunks)
    const patch: any = {
      id: 'cons',
      commits: [{ oid: 'ffffffffffffffffffffffffffffffffffffffff', message: 'x', author: { name: 'T', email: 't@example.com' } }],
      baseBranch: 'base',
      raw: { content: minimalNoHunkDiff('file.txt') },
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');

    expect(res.analysis === 'conflicts' || res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['file.txt']));
  });
});
