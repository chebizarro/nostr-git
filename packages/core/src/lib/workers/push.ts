import type { GitProvider } from '@nostr-git/git-wrapper';
import type { RepoCache, RepoCacheManager } from './cache.js';
import type { GitVendor } from '../vendor-providers.js';

export interface SafePushOptions {
  repoId: string;
  remoteUrl: string;
  branch?: string;
  token?: string;
  provider?: GitVendor;
  allowForce?: boolean;
  confirmDestructive?: boolean;
  preflight?: {
    blockIfUncommitted?: boolean;
    requireUpToDate?: boolean;
    blockIfShallow?: boolean;
  };
}

export async function safePushToRemoteUtil(
  git: GitProvider,
  cacheManager: RepoCacheManager,
  options: SafePushOptions,
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    isRepoCloned: (dir: string) => Promise<boolean>;
    isShallowClone: (key: string) => Promise<boolean>;
    resolveRobustBranch: (dir: string, requested?: string) => Promise<string>;
    hasUncommittedChanges: (dir: string) => Promise<boolean>;
    needsUpdate: (repoId: string, cloneUrls: string[], cache: RepoCache | null) => Promise<boolean>;
    pushToRemote: (args: { repoId: string; remoteUrl: string; branch?: string; token?: string; provider?: GitVendor }) => Promise<{ success?: boolean }>;
  }
): Promise<{
  success: boolean;
  pushed?: boolean;
  requiresConfirmation?: boolean;
  reason?: string;
  warning?: string;
  error?: string;
}> {
  const { repoId, remoteUrl, branch, token, provider, allowForce = false, confirmDestructive = false, preflight } = options;
  const { rootDir, canonicalRepoKey, isRepoCloned, isShallowClone, resolveRobustBranch, hasUncommittedChanges, needsUpdate, pushToRemote } = deps;
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  const pf = {
    blockIfUncommitted: true,
    requireUpToDate: true,
    blockIfShallow: false,
    ...(preflight || {})
  };

  try {
    const cloned = await isRepoCloned(dir);
    if (!cloned) return { success: false, error: 'Repository not cloned locally; clone before pushing.' };

    const targetBranch = await resolveRobustBranch(dir, branch);

    if (pf.blockIfUncommitted) {
      const dirty = await hasUncommittedChanges(dir);
      if (dirty) return { success: false, reason: 'uncommitted_changes', error: 'Working tree has uncommitted changes. Commit or stash before push.' };
    }

    if (pf.blockIfShallow) {
      const shallow = await isShallowClone(key);
      if (shallow) return { success: false, reason: 'shallow_clone', error: 'Repository is a shallow/refs-only clone. Upgrade to full clone before pushing.' };
    }

    if (pf.requireUpToDate) {
      const cache = await cacheManager.getRepoCache(key);
      if (provider !== 'grasp') {
        const remoteChanged = await needsUpdate(key, [remoteUrl], cache);
        if (remoteChanged) return { success: false, reason: 'remote_ahead', error: 'Remote appears to have new commits. Sync with remote before pushing to avoid non-fast-forward.' };
      }
    }

    if (allowForce && !confirmDestructive) {
      return { success: false, requiresConfirmation: true, reason: 'force_push_requires_confirmation', warning: 'Force push is potentially destructive. Confirmation required.' };
    }

    const pushRes = await pushToRemote({ repoId, remoteUrl, branch: targetBranch, token, provider });
    const ok = (pushRes as any)?.success;
    return { success: ok === undefined ? true : !!ok, pushed: true };
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) };
  }
}
