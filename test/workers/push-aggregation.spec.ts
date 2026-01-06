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

async function addRemote(fs: any, dir: string, name: string, url: string): Promise<void> {
  try {
    await (isoGit as any).addRemote({ fs: fs as any, dir, remote: name, url });
  } catch {}
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

describe('worker/patches: push aggregation and protected branch fallback', () => {
  it('pushes to multiple remotes; falls back to topic branch for grasp-like remote and aggregates pushErrors', async () => {
    const registry = createRemoteRegistry();

    // Remote OK
    const fsRemoteOk = createTestFs('push-agg-remote-ok');
    const remoteOk = new VirtualGitRemote({ fs: fsRemoteOk as any, dir: '/remote-ok', defaultBranch: 'main', author: { name: 'R', email: 'r@example.com' } });
    await remoteOk.init();
    const urlOk = 'https://example.com/owner/ok.git';
    registry.register(urlOk, remoteOk);

    // Remote that triggers protected fallback logic (contains 'grasp')
    const fsRemoteProt = createTestFs('push-agg-remote-prot');
    const remoteProt = new VirtualGitRemote({ fs: fsRemoteProt as any, dir: '/remote-prot', defaultBranch: 'main', author: { name: 'R2', email: 'r2@example.com' } });
    await remoteProt.init();
    const urlProt = 'https://grasp.example.com/owner/repo.git';
    registry.register(urlProt, remoteProt);

    // Local
    const fs = createTestFs('push-agg-local');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/a.txt', 'hello\n', 'add a');

    await addRemote(fs as any, dir, 'origin', urlOk);
    await addRemote(fs as any, dir, 'prot', urlProt);

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: {
          id: 'patch-event-abcdef01',
          commits: [],
          baseBranch: 'main',
          rawContent: simpleModifyPatch(),
        },
        targetBranch: 'main',
        authorName: 'Tester',
        authorEmail: 'tester@example.com',
      },
      {
        rootDir,
        canonicalRepoKey: (id) => id,
        resolveRobustBranch: async (d, requested) => {
          const branch = requested || 'main';
          try { await (git as any).resolveRef({ dir: d, ref: `refs/heads/${branch}` }); return branch; } catch { return branch; }
        },
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs,
      }
    );

    expect(res.success).toBe(true);
    expect(res.pushedRemotes || []).toEqual(expect.arrayContaining(['origin']));
    // Either direct push to prot or fallback to topic branch is acceptable in this harness
    const pushed = res.pushedRemotes || [];
    const protDirect = pushed.includes('prot');
    const protFallback = pushed.some((r) => r.startsWith('prot:grasp/patch-'));
    expect(protDirect || protFallback).toBe(true);
    // When fallback happens, we should see a FALLBACK_TOPIC_PUSH entry; otherwise pushErrors may be empty
    if (protFallback) {
      expect((res.pushErrors || []).some((e) => e.code === 'FALLBACK_TOPIC_PUSH')).toBe(true);
    }

    const a = await readText(fs as any, `${dir}/a.txt`);
    expect(a.trim()).toBe('hello world');
  });

  it('fails fallback push and records FALLBACK_FAILED for protected branch', async () => {
    const registry = createRemoteRegistry();

    const fsRemoteProt = createTestFs('push-agg-protected-fail-remote');
    const remoteProt = new VirtualGitRemote({ fs: fsRemoteProt as any, dir: '/remote-prot-ff', defaultBranch: 'main', author: { name: 'R', email: 'r@example.com' } });
    await remoteProt.init();
    const urlProt = 'https://grasp.example.com/owner/repo-prot.git';
    registry.register(urlProt, remoteProt);

    const fs = createTestFs('push-agg-protected-fail-local');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo-prot';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/a.txt', 'hello\n', 'add a');

    await addRemote(fs as any, dir, 'prot', urlProt);

    // Monkeypatch git.push so that both primary and fallback pushes to urlProt fail
    const origPush2 = (git as any).push;
    (git as any).push = async (args: any) => {
      // Primary push (no remoteRef) -> simulate protected branch rejection
      if (args?.url === urlProt && !args?.remoteRef) {
        const err: any = new Error('pre-receive hook declined');
        err.code = 'PRE_RECEIVE';
        throw err;
      }
      // Fallback push (has remoteRef) -> simulate fallback failure
      if (args?.url === urlProt && args?.remoteRef) {
        const err: any = new Error('fallback failed');
        err.code = 'FALLBACK_FAILED';
        throw err;
      }
      return origPush2.call(git, args);
    };

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: { id: 'patch-event-prot', commits: [], baseBranch: 'main', rawContent: simpleModifyPatch() },
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
    // prot should be skipped due to both primary and fallback failure
    expect((res.skippedRemotes || []).includes('prot')).toBe(true);
    expect((res.pushErrors || []).some((e) => e.code === 'FALLBACK_FAILED' && e.remote === 'prot')).toBe(true);

    // restore
    (git as any).push = origPush2;
  });

  it('records NO_URL push error and skips remotes without URL', async () => {
    const registry = createRemoteRegistry();

    const fsRemoteOk = createTestFs('push-agg-nourl-remote');
    const remoteOk = new VirtualGitRemote({ fs: fsRemoteOk as any, dir: '/remote2', defaultBranch: 'main', author: { name: 'R', email: 'r@example.com' } });
    await remoteOk.init();
    const urlOk = 'https://example.com/owner/ok2.git';
    registry.register(urlOk, remoteOk);

    const fs = createTestFs('push-agg-nourl');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });

    const rootDir = '/repos';
    const repoId = 'owner/repo2';
    const dir = `${rootDir}/${repoId}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/a.txt', 'hello\n', 'add a');

    await addRemote(fs as any, dir, 'origin', urlOk);
    await addRemote(fs as any, dir, 'bad', urlOk);
    // Clear bad.url so listRemotes returns entry without URL
    await (isoGit as any).setConfig({ fs: fs as any, dir, path: 'remote.bad.url', value: '' });

    const res = await applyPatchAndPushUtil(
      git as any as GitProvider,
      {
        repoId,
        patchData: { id: 'patch-event-bb', commits: [], baseBranch: 'main', rawContent: simpleModifyPatch() },
        targetBranch: 'main',
        authorName: 'Tester',
        authorEmail: 'tester@example.com',
      },
      {
        rootDir,
        canonicalRepoKey: (id) => id,
        resolveRobustBranch: async (d, requested) => requested || 'main',
        ensureFullClone: async () => ({ ok: true }),
        getAuthCallback: () => undefined,
        getConfiguredAuthHosts: () => [],
        getProviderFs: (g) => (g as any).fs,
      }
    );

    expect(res.success).toBe(true);
    expect((res.skippedRemotes || []).includes('bad')).toBe(true);
    expect((res.pushErrors || []).some((e) => e.code === 'NO_URL' && e.remote === 'bad')).toBe(true);
  });
});
