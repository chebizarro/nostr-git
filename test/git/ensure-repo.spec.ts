import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';

import { setGitProvider, getGitProvider } from '../../src/api/git-provider.js';
import {
  isRepoCloned,
  ensureRepo,
  ensureRepoFromEvent,
  detectDefaultBranch,
  getDefaultBranch,
  rootDir
} from '../../src/git/git.js';

import { VirtualGitRemote } from '../git/virtual-remote.js';
import { createRemoteRegistry } from '../utils/remote-registry.js';
import { createTestGitProvider } from '../utils/provider-harness.js';
import { createTestFs, mkdirp } from '../utils/lightningfs.js';
import { initRepo, commitFile } from '../utils/git-harness.js';

describe.sequential('git/git.ts: ensureRepo + ensureRepoFromEvent + default branch detection', () => {
  let prevProvider: any;

  beforeEach(() => {
    prevProvider = getGitProvider();
  });

  afterEach(() => {
    setGitProvider(prevProvider);
  });

  it('isRepoCloned detects existing repos by resolving HEAD', async () => {
    const fs = createTestFs('ensure-isRepoCloned');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });
    setGitProvider(git as any);

    const dir = `${rootDir}/cloned/check`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'main');
    await commitFile(h, '/README.md', 'hello\n', 'init');

    await expect(isRepoCloned(dir)).resolves.toBe(true);
    await expect(isRepoCloned(`${rootDir}/does/not/exist`)).resolves.toBe(false);
  });

  it('ensureRepo clones when not present and calls fetch when already cloned', async () => {
    const remoteFs = createTestFs('ensure-remote-basic');
    const remote = new VirtualGitRemote({
      fs: remoteFs as any,
      dir: '/remote',
      defaultBranch: 'main',
      author: { name: 'Remote', email: 'remote@example.com' }
    });
    await remote.seed({ 'README.md': 'hello\n' }, 'init');

    const registry = createRemoteRegistry();
    const url = 'https://example.com/owner/repo.git';
    registry.register(url, remote);

    const fs = createTestFs('ensure-local-basic');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });
    setGitProvider(git as any);

    const cloneSpy = vi.spyOn(git as any, 'clone');
    const fetchSpy = vi.spyOn(git as any, 'fetch');

    await ensureRepo({ host: 'example.com', owner: 'owner', repo: 'repo', branch: 'main' }, 1);

    const localDir = `${rootDir}/owner/repo`;
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    await expect(isRepoCloned(localDir)).resolves.toBe(true);

    await ensureRepo({ host: 'example.com', owner: 'owner', repo: 'repo', branch: 'main' }, 1);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('ensureRepoFromEvent prefers https clone URLs and converts ssh git@ URLs to https', async () => {
    const remoteFs = createTestFs('ensure-remote-ssh');
    const remote = new VirtualGitRemote({
      fs: remoteFs as any,
      dir: '/remote',
      defaultBranch: 'main',
      author: { name: 'Remote', email: 'remote@example.com' }
    });
    await remote.seed({ 'README.md': 'hello\n' }, 'init');

    const registry = createRemoteRegistry();
    const httpsUrl = 'https://example.com/owner/repo.git';
    registry.register(httpsUrl, remote);

    const fs = createTestFs('ensure-local-ssh');
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });
    setGitProvider(git as any);

    const cloneSpy = vi.spyOn(git as any, 'clone');

    const repoEvent: any = {
      repoId: 'ignored-by-test',
      clone: ['git@example.com:owner/repo.git']
    };

    await ensureRepoFromEvent(
      {
        repoEvent,
        repoKey: 'owner/repo'
      },
      1
    );

    expect(cloneSpy).toHaveBeenCalled();
    const lastArgs = cloneSpy.mock.calls[cloneSpy.mock.calls.length - 1]?.[0];
    expect(String(lastArgs?.url || '')).toBe(httpsUrl);

    const localDir = `${rootDir}/owner/repo`;
    await expect(isRepoCloned(localDir)).resolves.toBe(true);
  });

  it('detectDefaultBranch and getDefaultBranch return HEAD symbolic default branch and cache it', async () => {
    const fs = createTestFs('ensure-default-branch');
    const registry = createRemoteRegistry();
    const git = createTestGitProvider({ fs: fs as any, remoteRegistry: registry });
    setGitProvider(git as any);

    const repoKey = 'default-branch-repo';
    const dir = `${rootDir}/${repoKey}`;
    await mkdirp(fs as any, dir);

    const h = { fs: fs as any, dir, author: { name: 'Test', email: 't@example.com' } };
    await initRepo(h, 'develop');
    await commitFile(h, '/README.md', 'hello\n', 'init');

    const repoEvent: any = { repoId: 'ignored' };

    const detected = await detectDefaultBranch(repoEvent, repoKey);
    expect(detected).toBe('develop');

    const cached1 = await getDefaultBranch(repoEvent, repoKey);
    const cached2 = await getDefaultBranch(repoEvent, repoKey);
    expect(cached1).toBe('develop');
    expect(cached2).toBe('develop');
  });
});