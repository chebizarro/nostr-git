import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import type { GitProvider } from '../../src/git/provider.js';
import {
  analyzePatchMergeability,
  getMergeStatusMessage,
  buildMergeMetadataEventFromAnalysis,
  buildConflictMetadataEventFromAnalysis
} from '../../src/git/merge-analysis.js';

import * as isoGit from 'isomorphic-git';
import { VirtualGitRemote } from '../git/virtual-remote.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { initRepo, commitFile, createBranch, checkout, getHeadOid } from '../utils/git-harness.js';

function diffModifyLine1(oldLine: string, newLine: string): string {
  return [
    'diff --git a/file.txt b/file.txt',
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1,2 +1,2 @@',
    `-${oldLine}`,
    `+${newLine}`,
    ' line2',
    ''
  ].join('\\n');
}

async function addOriginRemote(fs: any, dir: string, url: string): Promise<void> {
  try {
    await (isoGit as any).addRemote({ fs: fs as any, dir, remote: 'origin', url });
  } catch {
    // ignore
  }
  try {
    await (isoGit as any).setConfig({
      fs: fs as any,
      dir,
      path: 'remote.origin.fetch',
      value: '+refs/heads/*:refs/remotes/origin/*'
    });
  } catch {
    // best-effort
  }
}

describe('git/merge-analysis.ts: analyzePatchMergeability + metadata builders', () => {
  it('detects fast-forward scenario (mergeBase === targetCommit)', async () => {
    const fs = createTestFs('merge-ff');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-ff';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    const base = await commitFile(h, '/file.txt', 'line1\nline2\n', 'base');

    await createBranch(h, 'patch', true);
    const patchCommit = await commitFile(h, '/file.txt', 'line1 patched\nline2\n', 'patch');

    await checkout(h, 'main');
    const targetCommit = await getHeadOid(h, 'HEAD');
    expect(targetCommit).toBe(base);

    const patch: any = {
      id: 'p1',
      commits: [{ oid: patchCommit, message: 'patch', author: { name: 'Test', email: 't@example.com' } }],
      baseBranch: 'main',
      raw: { content: diffModifyLine1('line1', 'line1 patched') }
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');

    expect(res.canMerge).toBe(true);
    expect(res.fastForward).toBe(true);
    expect(res.analysis).toBe('clean');

    const msg = getMergeStatusMessage(res);
    expect(msg.toLowerCase()).toContain('fast-forward');

    const meta = buildMergeMetadataEventFromAnalysis({
      repoAddr: '30617:pk:repo',
      rootId: 'root-id',
      targetBranch: 'main',
      baseBranch: 'main',
      result: res
    });

    expect(meta.kind).toBe(30411);
    expect((meta.tags as any[]).some((t) => t[0] === 'result' && t[1] === 'ff')).toBe(true);
  });

  it('detects up-to-date scenario when patch commits already exist in target branch', async () => {
    const fs = createTestFs('merge-up-to-date');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-up-to-date';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    const base = await commitFile(h, '/file.txt', 'line1\nline2\n', 'base');

    const patch: any = {
      id: 'p2',
      commits: [{ oid: base, message: 'base', author: { name: 'Test', email: 't@example.com' } }],
      baseBranch: 'main',
      raw: { content: diffModifyLine1('line1', 'line1 patched') }
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');

    expect(res.canMerge).toBe(true);
    expect(res.upToDate).toBe(true);
    expect(res.analysis).toBe('up-to-date');

    const msg = getMergeStatusMessage(res);
    expect(msg.toLowerCase()).toContain('already');
  });

  it('detects diverged remote when local target differs from origin and is not descendant', async () => {
    const remoteFs = createTestFs('merge-diverged-remote-remote');
    const remote = new VirtualGitRemote({
      fs: remoteFs as any,
      dir: '/remote',
      defaultBranch: 'main',
      author: { name: 'Remote', email: 'remote@example.com' }
    });
    await remote.seed({ 'file.txt': 'line1\nline2\n' }, 'base');

    const registry = createRemoteRegistry();
    const url = 'https://example.com/diverged/repo.git';
    registry.register(url, remote);

    const fs = createTestFs('merge-diverged-remote-local');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-diverged-remote';
    await mkdirp(fs as any, repoDir);

    await (git as any).clone({ dir: repoDir, url, ref: 'main' });
    await addOriginRemote(fs as any, repoDir, url);

    // Advance remote only
    await remote.writeFile('file.txt', 'line1 remote\nline2\n');
    await remote.commit('remote change', ['file.txt']);

    const patch: any = {
      id: 'p-diverged',
      // Use a commit oid that is not in the local repo to avoid fast-forward/up-to-date early returns
      commits: [
        {
          oid: 'ffffffffffffffffffffffffffffffffffffffff',
          message: 'external patch',
          author: { name: 'Someone', email: 's@example.com' }
        }
      ],
      baseBranch: 'main',
      raw: { content: diffModifyLine1('line1', 'line1 patched') }
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');

    expect(res.canMerge).toBe(false);
    expect(res.analysis).toBe('diverged');
    expect(String(res.errorMessage || '').toLowerCase()).toContain('diverged');

    const msg = getMergeStatusMessage(res);
    expect(msg.toLowerCase()).toContain('diverged');
  });

  it('detects conflicts when target branch changed since base and patch modifies same region', async () => {
    const fs = createTestFs('merge-conflicts');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const repoDir = '/repos/merge-conflicts';
    await mkdirp(fs as any, repoDir);

    const h = { fs: fs as any, dir: repoDir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'base');
    await commitFile(h, '/file.txt', 'line1\nline2\n', 'base');

    // main diverges from base
    await createBranch(h, 'main', true);
    await commitFile(h, '/file.txt', 'line1 main\nline2\n', 'main change');

    // patch branch from base modifies same region
    await checkout(h, 'base');
    await createBranch(h, 'patch', true);
    const patchCommit = await commitFile(h, '/file.txt', 'line1 patched\nline2\n', 'patch change');

    const patch: any = {
      id: 'p-conflict',
      commits: [{ oid: patchCommit, message: 'patch change', author: { name: 'Test', email: 't@example.com' } }],
      baseBranch: 'base',
      raw: { content: diffModifyLine1('line1', 'line1 patched') }
    };

    const res = await analyzePatchMergeability(git as any as GitProvider, repoDir, patch, 'main');

    expect(res.canMerge).toBe(false);
    expect(res.hasConflicts).toBe(true);
    expect(res.conflictFiles).toEqual(expect.arrayContaining(['file.txt']));
    expect(res.analysis).toBe('conflicts');

    const msg = getMergeStatusMessage(res);
    expect(msg.toLowerCase()).toContain('conflict');

    const conflictMeta = buildConflictMetadataEventFromAnalysis({
      repoAddr: '30617:pk:repo',
      rootId: 'root-id',
      result: res
    });

    expect(conflictMeta).toBeTruthy();
    expect((conflictMeta as any).kind).toBe(30412);
    expect(((conflictMeta as any).tags as any[]).some((t) => t[0] === 'file' && t[1] === 'file.txt')).toBe(true);
  });
});