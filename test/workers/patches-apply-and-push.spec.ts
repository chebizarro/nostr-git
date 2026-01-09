import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';

import * as isoGit from 'isomorphic-git';
import type { GitProvider } from '../../src/git/provider.js';
import { applyPatchAndPushUtil } from '../../src/worker/workers/patches.js';

import { VirtualGitRemote } from '../git/virtual-remote.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { createTestFs, mkdirp, readText } from '../utils/lightningfs.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

async function addOriginRemote(fs: any, dir: string, url: string): Promise<void> {
  try {
    await (isoGit as any).addRemote({ fs: fs as any, dir, remote: 'origin', url });
  } catch {
    // ignore if already exists
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

function patchModifyAddDelete(): string {
  return [
    // modify a.txt: hello -> hello world
    'diff --git a/a.txt b/a.txt',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1 +1 @@',
    '-hello',
    '+hello world',
    '',
    // add b.txt
    'diff --git a/b.txt b/b.txt',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/b.txt',
    '@@ -0,0 +1 @@',
    '+new file',
    '',
    // delete c.txt
    'diff --git a/c.txt b/c.txt',
    'deleted file mode 100644',
    '--- a/c.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-gone',
    ''
  ].join('\n');
}

describe('worker/patches: applyPatchAndPushUtil', () => {
  it('applies modify/add/delete patch and pushes to origin (virtual remote)', async () => {
    const remoteFs = createTestFs('apply-remote-basic');
    const remote = new VirtualGitRemote({
      fs: remoteFs as any,
      dir: '/remote',
      defaultBranch: 'main',
      author: { name: 'Remote', email: 'remote@example.com' }
    });
    await remote.init();

    const registry = createRemoteRegistry();
    const url = 'https://example.com/owner/repo.git';
    registry.register(url, remote);

    const fs = createTestFs('apply-local-basic');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/a.txt', 'hello\n', 'add a');
    await commitFile(h, '/c.txt', 'gone\n', 'add c');

    await addOriginRemote(fs as any, dir, url);

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-event-12345678',
          commits: [],
          baseBranch: 'main',
          rawContent: patchModifyAddDelete()
        },
        targetBranch: 'main',
        mergeCommitMessage: 'Merge patch',
        authorName: 'Tester',
        authorEmail: 'tester@example.com'
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (d, requested) => {
          const branch = requested || 'main';
          try {
            await (git as any).resolveRef({ dir: d, ref: `refs/heads/${branch}` });
            return branch;
          } catch {
            // Branch doesn't exist, try to list branches and return first one
            try {
              const branches = await (git as any).listBranches({ dir: d });
              if (branches && branches.length > 0) {
                return branches[0];
              }
            } catch {}
            return branch;
          }
        },
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs
      }
    );

    expect(res.success).toBe(true);
    expect(typeof res.mergeCommitOid).toBe('string');
    expect(res.pushedRemotes).toEqual(expect.arrayContaining(['origin']));

    const a = await readText(fs as any, `${dir}/a.txt`);
    expect(a.trim()).toBe('hello world');

    const b = await readText(fs as any, `${dir}/b.txt`);
    expect(b.trim()).toBe('new file');

    await expect((fs as any).promises.stat(`${dir}/c.txt`)).rejects.toBeTruthy();
  });

  it('rejects unsupported patch features (rename/binary)', async () => {
    const fs = createTestFs('apply-unsupported');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');

    const unsupported = [
      'diff --git a/a.txt b/b.txt',
      'rename from a.txt',
      'rename to b.txt',
      ''
    ].join('\n');

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-unsupported',
          commits: [],
          baseBranch: 'main',
          rawContent: unsupported
        },
        targetBranch: 'main',
        authorName: 'Tester',
        authorEmail: 'tester@example.com'
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (d, requested) => {
          const branch = requested || 'main';
          try {
            await (git as any).resolveRef({ dir: d, ref: `refs/heads/${branch}` });
            return branch;
          } catch {
            // Branch doesn't exist, try to list branches and return first one
            try {
              const branches = await (git as any).listBranches({ dir: d });
              if (branches && branches.length > 0) {
                return branches[0];
              }
            } catch {}
            return branch;
          }
        },
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs
      }
    );

    expect(res.success).toBe(false);
    expect(String(res.error || '')).toContain('Unsupported');
  });

  it('returns "No changes to apply" when patch contains no diffs and repo has no tracked files', async () => {
    const fs = createTestFs('apply-no-changes');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');

    // Patch with no diff blocks -> parsePatchContent([]) => []
    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-empty',
          commits: [],
          baseBranch: 'main',
          rawContent: 'This is not a diff\n'
        },
        targetBranch: 'main',
        authorName: 'Tester',
        authorEmail: 'tester@example.com'
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (d, requested) => {
          const branch = requested || 'main';
          try {
            await (git as any).resolveRef({ dir: d, ref: `refs/heads/${branch}` });
            return branch;
          } catch {
            // Branch doesn't exist, try to list branches and return first one
            try {
              const branches = await (git as any).listBranches({ dir: d });
              if (branches && branches.length > 0) {
                return branches[0];
              }
            } catch {}
            return branch;
          }
        },
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs
      }
    );

    expect(res.success).toBe(false);
    expect(String(res.error || '')).toContain('No changes to apply');
  });

  it('falls back to topic branch push when primary push is rejected by remote policy', async () => {
    const remoteFs = createTestFs('apply-remote-fallback');
    const remote = new VirtualGitRemote({
      fs: remoteFs as any,
      dir: '/remote',
      defaultBranch: 'main',
      author: { name: 'Remote', email: 'remote@example.com' }
    });
    await remote.init();

    const registry = createRemoteRegistry();
    const url = 'https://relay.ngit.dev/owner/repo.git';
    registry.register(url, remote);

    const fs = createTestFs('apply-local-fallback');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/a.txt', 'hello\n', 'add a');

    await addOriginRemote(fs as any, dir, url);

    // Override push behavior to simulate protected branch rejection on primary push only.
    const origPush = (git as any).push.bind(git);
    (git as any).push = async (args: any) => {
      if (!args?.remoteRef) {
        const e: any = new Error('pre-receive hook declined');
        e.code = 'REJECTED';
        throw e;
      }
      return await origPush(args);
    };

    const patch = [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-hello',
      '+hello world',
      ''
    ].join('\n');

    const patchId = 'patch-event-abcdef0123456789';

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: patchId,
          commits: [],
          baseBranch: 'main',
          rawContent: patch
        },
        targetBranch: 'main',
        mergeCommitMessage: 'Merge patch (fallback)',
        authorName: 'Tester',
        authorEmail: 'tester@example.com'
      },
      {
        rootDir,
        parseRepoId: (id) => id,
        resolveBranchName: async (d, requested) => {
          const branch = requested || 'main';
          try {
            await (git as any).resolveRef({ dir: d, ref: `refs/heads/${branch}` });
            return branch;
          } catch {
            // Branch doesn't exist, try to list branches and return first one
            try {
              const branches = await (git as any).listBranches({ dir: d });
              if (branches && branches.length > 0) {
                return branches[0];
              }
            } catch {}
            return branch;
          }
        },
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs
      }
    );

    // restore
    (git as any).push = origPush;

    expect(res.success).toBe(true);
    expect(Array.isArray(res.pushedRemotes)).toBe(true);

    const shortId = patchId.slice(0, 8);
    const expectedTopic = `origin:grasp/patch-${shortId}`;
    expect(res.pushedRemotes).toEqual(expect.arrayContaining([expectedTopic]));

    expect(Array.isArray(res.pushErrors)).toBe(true);
    expect(res.pushErrors?.some((e) => e.code === 'FALLBACK_TOPIC_PUSH')).toBe(true);

    const a = await readText(fs as any, `${dir}/a.txt`);
    expect(a.trim()).toBe('hello world');
  });
});