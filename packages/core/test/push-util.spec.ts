import { describe, it, expect, vi } from 'vitest';
import type { GitProvider } from '@nostr-git/git-wrapper';
import { safePushToRemoteUtil } from '../src/lib/workers/push.js';
import type { RepoCacheManager } from '../src/lib/workers/cache.js';
import type { GitVendor } from '../src/lib/vendor-providers.js';

function makeGit(): GitProvider {
  return {} as any;
}

function makeCache(): RepoCacheManager {
  return {
    getRepoCache: vi.fn(async () => null)
  } as any;
}

describe('safePushToRemoteUtil', () => {
  it('requires confirmation when allowForce is true and not confirmed', async () => {
    const res = await safePushToRemoteUtil(
      makeGit(),
      makeCache(),
      { repoId: 'a/b', remoteUrl: 'https://x', allowForce: true },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s,
        isRepoCloned: async () => true,
        isShallowClone: async () => false,
        resolveRobustBranch: async () => 'main',
        hasUncommittedChanges: async () => false,
        needsUpdate: async () => false,
        pushToRemote: async () => ({ success: true })
      }
    );
    expect(res.success).toBe(false);
    expect(res.requiresConfirmation).toBe(true);
  });

  it('blocks when repo is not cloned', async () => {
    const res = await safePushToRemoteUtil(
      makeGit(),
      makeCache(),
      { repoId: 'a/b', remoteUrl: 'https://x' },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s,
        isRepoCloned: async () => false,
        isShallowClone: async () => false,
        resolveRobustBranch: async () => 'main',
        hasUncommittedChanges: async () => false,
        needsUpdate: async () => false,
        pushToRemote: async () => ({ success: true })
      }
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not cloned/i);
  });

  it('blocks when remote ahead is detected', async () => {
    const res = await safePushToRemoteUtil(
      makeGit(),
      makeCache(),
      { repoId: 'a/b', remoteUrl: 'https://x' },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s,
        isRepoCloned: async () => true,
        isShallowClone: async () => false,
        resolveRobustBranch: async () => 'main',
        hasUncommittedChanges: async () => false,
        needsUpdate: async () => true,
        pushToRemote: async () => ({ success: true })
      }
    );
    expect(res.success).toBe(false);
    expect(res.reason).toBe('remote_ahead');
  });

  it('succeeds in a normal push case', async () => {
    const pushSpy = vi.fn(async () => ({ success: true }));
    const res = await safePushToRemoteUtil(
      makeGit(),
      makeCache(),
      { repoId: 'a/b', remoteUrl: 'https://x', provider: 'github' as GitVendor },
      {
        rootDir: '/tmp',
        canonicalRepoKey: (s) => s,
        isRepoCloned: async () => true,
        isShallowClone: async () => false,
        resolveRobustBranch: async () => 'main',
        hasUncommittedChanges: async () => false,
        needsUpdate: async () => false,
        pushToRemote: pushSpy
      }
    );
    expect(res.success).toBe(true);
    expect(res.pushed).toBe(true);
    expect(pushSpy).toHaveBeenCalled();
  });
});
