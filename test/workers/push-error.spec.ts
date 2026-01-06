import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import * as isoGit from 'isomorphic-git';
import type { GitProvider } from '../../src/git/provider.js';
import { applyPatchAndPushUtil } from '../../src/worker/workers/patches.js';

import { VirtualGitRemote } from '../git/virtual-remote.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

async function addRemote(fs: any, dir: string, name: string, url: string): Promise<void> {
  try { await (isoGit as any).addRemote({ fs: fs as any, dir, remote: name, url }); } catch {}
}

function simpleModifyPatch(): string {
  return [
    'diff --git a/a.txt b/a.txt',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1 +1 @@',
    '-hello',
    '+hello world',
    ''
  ].join('\n');
}

describe('worker/patches: push error aggregation paths', () => {
  it('captures generic push errors for a remote and continues with others', async () => {
    const registry = createRemoteRegistry();
    const fsRemoteOk = createTestFs('push-error-remote-ok');
    const remoteOk = new VirtualGitRemote({ fs: fsRemoteOk as any, dir: '/remote-ok3', defaultBranch: 'main', author: { name: 'R', email: 'r@example.com' } });
    await remoteOk.init();
    const urlOk = 'https://example.com/owner/ok3.git';
    registry.register(urlOk, remoteOk);

    const fsRemoteFail = createTestFs('push-error-remote-fail');
    const remoteFail = new VirtualGitRemote({ fs: fsRemoteFail as any, dir: '/remote-fail', defaultBranch: 'main', author: { name: 'R2', email: 'r2@example.com' } });
    await remoteFail.init();
    const urlFail = 'https://example.com/owner/fail.git';
    registry.register(urlFail, remoteFail);

    const fs = createTestFs('push-error-local');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repoX';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/a.txt', 'hello\n', 'add a');

    await addRemote(fs as any, dir, 'origin', urlOk);
    await addRemote(fs as any, dir, 'broken', urlFail);

    // Monkeypatch git.push to throw for the 'broken' remote URL
    const origPush = (git as any).push;
    (git as any).push = async (args: any) => {
      if (args?.url === urlFail) {
        const err: any = new Error('Simulated push failure');
        err.code = 'SIM_FAIL';
        throw err;
      }
      return origPush.call(git, args);
    };

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: { id: 'patch-event-err', commits: [], baseBranch: 'main', rawContent: simpleModifyPatch() },
        targetBranch: 'main',
        authorName: 'Tester',
        authorEmail: 'tester@example.com',
      },
      {
        rootDir,
        canonicalRepoKey: (id) => id,
        resolveRobustBranch: async (_d, requested) => requested || 'main',
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs,
      }
    );

    expect(res.success).toBe(true);
    expect(res.pushedRemotes || []).toEqual(expect.arrayContaining(['origin']));
    expect((res.skippedRemotes || []).includes('broken')).toBe(true);
    expect((res.pushErrors || []).some((e) => e.code === 'SIM_FAIL' && e.remote === 'broken')).toBe(true);

    // restore
    (git as any).push = origPush;
  });
});
