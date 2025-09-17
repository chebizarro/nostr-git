import { expose } from 'comlink';
import { finalizeEvent, SimplePool } from 'nostr-tools';
import { GitProvider, getGitProvider } from '@nostr-git/git-wrapper';
import { rootDir } from '../git.js';
import { Buffer } from 'buffer';
import { analyzePatchMergeability, type MergeAnalysisResult } from '../merge-analysis.js';
import { getGitServiceApi } from '../git/factory.js';
import type { GitVendor } from '../vendor-providers.js';
import { createRepoStateEvent } from '@nostr-git/shared-types';
import { canonicalRepoKey } from '../utils/canonicalRepoKey.js';

import { setAuthConfig, getAuthCallback, getConfiguredAuthHosts, type AuthConfig } from './auth.js';
import { RepoCache, RepoCacheManager } from './cache.js';
import { getProviderFs, isRepoClonedFs, safeRmrf } from './fs-utils.js';
import { resolveRobustBranch } from './branches.js';
import {
  cloneRemoteRepoUtil,
  clearCloneTracking,
  smartInitializeRepoUtil,
  initializeRepoUtil,
  ensureShallowCloneUtil,
  ensureFullCloneUtil
} from './repos.js';
import { safePushToRemoteUtil } from './push.js';
import { needsUpdateUtil, syncWithRemoteUtil } from './sync.js';
import { analyzePatchMergeUtil, applyPatchAndPushUtil } from './patches.js';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

// Environment-aware Git provider (browser/node) from git-wrapper
const git: GitProvider = getGitProvider();

/**
 * Resolve branch name with multi-fallback strategy
 * Tries the provided branch first, then common defaults in order
 */
async function resolveRobustBranchInWorker(dir: string, requestedBranch?: string): Promise<string> {
  return resolveRobustBranch(git, dir, requestedBranch);
}

// In-memory tracking (for current session)
// Always key by canonicalRepoKey(repoId)
const clonedRepos = new Set<string>();
const repoDataLevels = new Map<string, 'refs' | 'shallow' | 'full'>();

// Persistent cache now imported from './cache'

function toPlain<T>(val: T): T {
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return val;
  }
}

const cacheManager = new RepoCacheManager();

// Initialize cache cleanup on worker start
cacheManager.clearOldCache().catch(console.warn);

// ----------------------
// Safety/Preflight Utils
// ----------------------
async function hasUncommittedChanges(dir: string): Promise<boolean> {
  try {
    const matrix = await git.statusMatrix({ dir });
    for (const row of matrix) {
      // statusMatrix row: [filepath, HEAD, WORKDIR, STAGE]
      const head = row[1];
      const workdir = row[2];
      const stage = row[3];
      if (head !== workdir || stage !== workdir) {
        return true;
      }
    }
    return false;
  } catch (err) {
    console.warn('Failed to compute statusMatrix; assuming no changes:', err);
    return false;
  }
}

async function isShallowClone(key: string): Promise<boolean> {
  const level = repoDataLevels.get(key);
  return level === 'refs' || level === 'shallow';
}

/**
 * Safe push with preflight validations and optional destructive-action confirmation.
 */
async function safePushToRemote(options: {
  repoId: string;
  remoteUrl: string;
  branch?: string;
  token?: string;
  provider?: GitVendor;
  allowForce?: boolean; // if true, a non-FF push requires explicit confirmation
  confirmDestructive?: boolean; // must be true to proceed with force
  preflight?: {
    blockIfUncommitted?: boolean;
    requireUpToDate?: boolean; // block if remote appears ahead/newer
    blockIfShallow?: boolean;
  };
}): Promise<{
  success: boolean;
  pushed?: boolean;
  requiresConfirmation?: boolean;
  reason?: string;
  warning?: string;
  error?: string;
}> {
  return safePushToRemoteUtil(git, cacheManager, options, {
    rootDir,
    canonicalRepoKey,
    isRepoCloned,
    isShallowClone,
    resolveRobustBranch: (dir, requested) => resolveRobustBranchInWorker(dir, requested),
    hasUncommittedChanges,
    needsUpdate,
    pushToRemote: ({ repoId, remoteUrl, branch, token, provider }) =>
      pushToRemote({ repoId, remoteUrl, branch, token, provider })
  });
}

// Lightweight message-based RPC for calls that may trip Comlink cloning issues
self.addEventListener('message', async (event: MessageEvent) => {
  const msg: any = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'rpc:syncWithRemote') {
    const { id, args } = msg;
    try {
      const res = await syncWithRemote(args);
      // Ensure plain, cloneable result
      // @ts-ignore postMessage in worker scope
      self.postMessage({ type: 'rpc:syncWithRemote:result', id, ok: true, result: toPlain(res) });
    } catch (e: any) {
      // @ts-ignore postMessage in worker scope
      self.postMessage({
        type: 'rpc:syncWithRemote:result',
        id,
        ok: false,
        error: e?.message || String(e)
      });
    }
  }
});

/**
 * Check if repository needs updating by comparing remote HEAD with cached HEAD
 */
async function needsUpdate(
  repoId: string,
  cloneUrls: string[],
  cache: RepoCache | null
): Promise<boolean> {
  return needsUpdateUtil(git, repoId, cloneUrls, cache, Date.now());
}

/**
 * Sync local repository with remote HEAD
 * This ensures the local repo always points to the latest remote HEAD
 */
async function syncWithRemote({
  repoId,
  cloneUrls,
  branch
}: {
  repoId: string;
  cloneUrls: string[];
  branch?: string;
}) {
  return await syncWithRemoteUtil(
    git,
    cacheManager,
    { repoId, cloneUrls, branch },
    {
      rootDir,
      canonicalRepoKey,
      resolveRobustBranch: (dir, requested) => resolveRobustBranchInWorker(dir, requested),
      isRepoCloned,
      toPlain
    }
  );
}

/**
 * Smart repository initialization that checks cache and only updates when necessary
 */
async function smartInitializeRepo({
  repoId,
  cloneUrls,
  forceUpdate = false
}: {
  repoId: string;
  cloneUrls: string[];
  forceUpdate?: boolean;
}) {
  const sendProgress = (phase: string, loaded?: number, total?: number) => {
    self.postMessage({
      type: 'clone-progress',
      repoId,
      phase,
      loaded,
      total,
      progress: total ? (loaded || 0) / total : undefined
    });
  };
  return smartInitializeRepoUtil(
    git,
    cacheManager,
    { repoId, cloneUrls, forceUpdate },
    {
      rootDir,
      canonicalRepoKey,
      repoDataLevels,
      clonedRepos,
      isRepoCloned: (g, dir) => isRepoClonedFs(g, dir),
      resolveRobustBranch: (g, dir, requested) => resolveRobustBranch(g, dir, requested)
    },
    sendProgress
  );
}

/**
 * Initialize a repository with minimal data - just refs and basic metadata
 * This is the fastest initial load, only fetching what's needed for branch listing
 */
const initializeRepo = async ({ repoId, cloneUrls }: { repoId: string; cloneUrls: string[] }) => {
  const sendProgress = (phase: string, loaded?: number, total?: number) => {
    self.postMessage({ type: 'clone-progress', repoId, phase, loaded, total });
  };
  return initializeRepoUtil(
    git,
    cacheManager,
    { repoId, cloneUrls },
    { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos },
    sendProgress
  );
};

/**
 * Ensure repository has shallow clone data (HEAD commit + tree) with smart caching
 * This enables file listing and content access for the default branch
 */
const ensureShallowClone = async ({ repoId, branch }: { repoId: string; branch?: string }) => {
  const sendProgress = (phase: string, loaded?: number, total?: number) => {
    self.postMessage({ type: 'clone-progress', repoId, phase, loaded, total });
  };
  return ensureShallowCloneUtil(
    git,
    { repoId, branch },
    {
      rootDir,
      canonicalRepoKey,
      repoDataLevels,
      clonedRepos,
      isRepoCloned: (g, dir) => isRepoClonedFs(g, dir),
      resolveRobustBranch: (g, dir, requested) => resolveRobustBranch(g, dir, requested)
    },
    sendProgress
  );
};

/**
 * Ensure repository has full history (for commit history, file history, etc.)
 */
const ensureFullClone = async ({
  repoId,
  branch,
  depth = 50
}: {
  repoId: string;
  branch?: string;
  depth?: number;
}) => {
  const sendProgress = (phase: string, loaded?: number, total?: number) => {
    self.postMessage({
      type: 'clone-progress',
      repoId,
      phase,
      loaded,
      total,
      progress: total ? (loaded || 0) / total : undefined
    });
  };
  return ensureFullCloneUtil(
    git,
    { repoId, branch, depth },
    {
      rootDir,
      canonicalRepoKey,
      repoDataLevels,
      clonedRepos,
      isRepoCloned: (g, dir) => isRepoClonedFs(g, dir),
      resolveRobustBranch: (g, dir, requested) => resolveRobustBranch(g, dir, requested)
    },
    sendProgress
  );
};

/**
 * Legacy clone function - now uses smart initialization strategy
 * Checks cache and only downloads when necessary
 */
const clone = async ({ repoId, cloneUrls }: { repoId: string; cloneUrls: string[] }) => {
  try {
    // Use smart initialization
    const initResult = await smartInitializeRepo({ repoId, cloneUrls });
    if (!initResult.success) {
      return initResult;
    }

    // If we got data from cache and it's already shallow/full, we're done
    if (initResult.fromCache && initResult.dataLevel !== 'refs') {
      return initResult;
    }

    // Otherwise, ensure we have at least shallow clone
    const shallowResult = await ensureShallowClone({ repoId });
    if (!shallowResult.success) {
      return shallowResult;
    }

    return {
      success: true,
      repoId,
      dataLevel: shallowResult.dataLevel,
      fromCache: initResult.fromCache
    };
  } catch (error: any) {
    console.error(`Clone failed for ${repoId}:`, error);
    return {
      success: false,
      repoId,
      error: error.message || String(error)
    };
  }
};

/**
 * Clear clone cache and data level tracking
 */
const clearCloneCache = async () => {
  clearCloneTracking(clonedRepos, repoDataLevels);
  try {
    await cacheManager.clearOldCache();
  } catch (error) {
    console.warn('Failed to clear persistent cache:', error);
  }
  return { success: true };
};

/**
 * Enhanced delete repository function that also clears cache
 */
async function deleteRepo({ repoId }: { repoId: string }) {
  // Remove from tracked sets
  const key = canonicalRepoKey(repoId);
  clonedRepos.delete(key);
  repoDataLevels.delete(key);

  // Remove from persistent cache
  try {
    await cacheManager.deleteRepoCache(key);
  } catch (error) {
    console.warn(`Failed to delete cache for ${repoId}:`, error);
  }

  // Remove directory using provider fs if available
  const dir = `${rootDir}/${key}`;
  try {
    const fs: any = getProviderFs(git);
    await safeRmrf(fs, dir);
    return { success: true, repoId };
  } catch (error) {
    console.error(`Failed to delete repo directory ${dir}:`, error);
    return {
      success: false,
      repoId,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get the total number of commits in a repository
 * This is a lightweight operation that doesn't require downloading the full history
 */
async function getCommitCount({ repoId, branch }: { repoId: string; branch?: string }): Promise<{
  success: boolean;
  count?: number;
  repoId: string;
  branch: string;
  fromCache?: boolean;
  error?: string;
}> {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  // Use robust multi-fallback branch resolution
  let targetBranch: string = branch || 'main'; // Initialize with fallback
  try {
    targetBranch = await resolveRobustBranchInWorker(dir, branch);

    // First check if we already have the full history
    const currentLevel = repoDataLevels.get(key);
    if (currentLevel === 'full') {
      // If we have full history, we can count commits locally
      const commits = await git.log({
        dir,
        ref: targetBranch
      });
      return {
        success: true,
        count: commits.length,
        repoId,
        branch: targetBranch,
        fromCache: true
      };
    }

    // If we don't have full history, do a lightweight remote count
    // This uses git's protocol to get just the commit count
    const cloneUrl = `https://github.com/${key}.git`;

    // This is a lightweight operation that doesn't download the full history
    const refs = await git.listServerRefs({
      url: cloneUrl,
      prefix: 'refs/heads/',
      symrefs: true
    });

    // Find the specific branch we're interested in
    const branchRef = refs.find((ref: { ref: string }) => ref.ref === `refs/heads/${targetBranch}`);

    if (!branchRef) {
      return {
        success: false,
        repoId,
        branch: targetBranch,
        error: `Branch ${targetBranch} not found`
      };
    }

    // For remote counting, we can only get an accurate count if we fetch the full history
    // This is a limitation of the git protocol
    // As a workaround, we'll return the depth we have if we have a shallow clone
    if (currentLevel === 'shallow') {
      const commits = await git.log({
        dir,
        ref: targetBranch
      });
      return {
        success: true,
        count: commits.length,
        repoId,
        branch: targetBranch,
        fromCache: true
      };
    }

    // If we don't have the repo cloned yet, we can't get an accurate count
    // without cloning first
    return {
      success: false,
      repoId,
      branch: targetBranch,
      error: 'Repository not fully cloned. Clone the repository first to get commit count.'
    };
  } catch (error) {
    console.error(`Error getting commit count for ${repoId}:`, error);
    return {
      success: false,
      repoId,
      branch: targetBranch,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function isRepoCloned(dir: string): Promise<boolean> {
  return isRepoClonedFs(git, dir);
}

/**
      };
    }
  }

  console.log(`Upgrading repository ${repoId} to full clone (depth: ${depth})...`);

  const sendProgress = (phase: string, loaded?: number, total?: number) => {
    self.postMessage({
      type: 'clone-progress',
      repoId,
      phase,
      loaded,
      total,
      progress: total ? (loaded || 0) / total : undefined
    });
  };

  sendProgress(`Fetching commit history (depth: ${depth})...`);

  try {
    // Get remote URL for fetch operation
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');
    
    if (!originRemote || !originRemote.url) {
      throw new Error('Origin remote not found or has no URL configured');
    }
    
    // Fetch more history - unshallow the repository
    const authCallback = getAuthCallback(originRemote.url);
    await git.fetch({
      dir,
      url: originRemote.url,
      ref: targetBranch,
      depth: Math.min(depth, 100), // Cap at 100 to prevent excessive downloads
      singleBranch: true,
      tags: false,
      onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
        sendProgress(`Full clone: ${progress.phase}`, progress.loaded, progress.total);
      },
      ...(authCallback && { onAuth: authCallback }),
    });

    sendProgress('Full clone completed');

    // Update data level
    repoDataLevels.set(key, 'full');
    console.log(`Repository ${repoId} upgraded to full clone successfully`);

    return { success: true, repoId, cached: false, level: 'full' };
  } catch (error: any) {
    console.error(`Failed to create full clone for repository ${repoId}:`, error);
    return { success: false, repoId, error: error.message };
  }
};

/**
 * Get the current data level for a repository
 */
const getRepoDataLevel = (repoId: string): 'none' | 'refs' | 'shallow' | 'full' => {
  const key = canonicalRepoKey(repoId);
  if (!clonedRepos.has(key)) return 'none';
  return repoDataLevels.get(key) || 'none';
};

/**
 * Get commit history for a repository
 * Ensures the repository has sufficient history depth before fetching commits
 */
const getCommitHistory = async ({
  repoId,
  branch,
  depth = 50
}: {
  repoId: string;
  branch?: string;
  depth?: number;
}) => {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  // Use robust multi-fallback branch resolution
  const targetBranch = await resolveRobustBranchInWorker(dir, branch);
  let attempt = 0;
  let maxAttempts = 3; // Increased attempts
  let lastError = null;
  let currentDepth = Math.max(depth, 50); // Ensure minimum depth

  while (attempt < maxAttempts) {
    try {
      // Always ensure we have sufficient history for the requested depth
      const cloneResult = await ensureFullClone({ repoId, branch, depth: currentDepth });
      if (!cloneResult.success) {
        throw new Error(`Failed to ensure full clone: ${cloneResult.error}`);
      }

      // Verify the repository has the expected data level
      const actualDataLevel = repoDataLevels.get(key);
      if (actualDataLevel !== 'full') {
        console.warn(`Expected full clone but got ${actualDataLevel}, forcing full clone...`);
        // Force a full clone by temporarily removing from cache
        const wasCloned = clonedRepos.has(key);
        clonedRepos.delete(key);
        repoDataLevels.delete(key);

        const retryResult = await ensureFullClone({ repoId, branch, depth: currentDepth });
        if (!retryResult.success) {
          throw new Error(`Failed to force full clone: ${retryResult.error}`);
        }

        if (wasCloned) {
          clonedRepos.add(key);
        }
      }

      const commits = await git.log({
        dir,
        ref: targetBranch,
        depth: currentDepth
      });

      return {
        success: true,
        commits,
        repoId,
        branch,
        actualDepth: commits.length,
        requestedDepth: currentDepth
      };
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt + 1} failed for getCommitHistory ${repoId}:`, error);

      // Handle different types of errors
      if (error && error.message) {
        if (error.message.includes('Could not find') && attempt < maxAttempts - 1) {
          console.warn(
            `NotFoundError in getCommitHistory for ${repoId}, deepening and retrying...`
          );
          // Exponentially increase depth
          currentDepth = Math.min(currentDepth * 2, 1000);
          attempt++;
          continue;
        } else if (error.message.includes('shallow') && attempt < maxAttempts - 1) {
          console.warn(`Shallow clone issue for ${repoId}, forcing full clone...`);
          // Force re-clone by clearing cache
          clonedRepos.delete(key);
          repoDataLevels.delete(key);
          currentDepth = Math.max(currentDepth, 100);
          attempt++;
          continue;
        }
      }

      console.error(`Error getting commit history for ${repoId}:`, error);
      break;
    }
  }

  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    repoId,
    branch: targetBranch,
    retried: attempt > 0,
    finalDepth: currentDepth
  };
};

/**
 * Analyze if a patch can be merged cleanly into the target branch
 */
async function analyzePatchMerge({
  repoId,
  patchData,
  targetBranch
}: {
  repoId: string;
  patchData: {
    id: string;
    commits: Array<{ oid: string; message: string; author: { name: string; email: string } }>;
    baseBranch: string;
    rawContent: string;
  };
  targetBranch?: string;
}): Promise<MergeAnalysisResult> {
  return analyzePatchMergeUtil(
    git,
    { repoId, patchData, targetBranch },
    {
      rootDir,
      canonicalRepoKey,
      resolveRobustBranch: (dir, requested) => resolveRobustBranchInWorker(dir, requested),
      analyzePatchMergeability
    }
  );
}

/**
 * Apply a patch to the repository and push to all remotes (delegated to util)
 */
async function applyPatchAndPush(params: {
  repoId: string;
  patchData: {
    id: string;
    commits: Array<{ oid: string; message: string; author: { name: string; email: string } }>;
    baseBranch: string;
    rawContent: string;
  };
  targetBranch?: string;
  mergeCommitMessage?: string;
  authorName: string;
  authorEmail: string;
  onProgress?: (step: string, progress: number) => void;
}): Promise<{
  success: boolean;
  error?: string;
  mergeCommitOid?: string;
  pushedRemotes?: string[];
  skippedRemotes?: string[];
  warning?: string;
  pushErrors?: Array<{ remote: string; url: string; error: string; code: string; stack: string }>;
}> {
  return applyPatchAndPushUtil(git, params, {
    rootDir,
    canonicalRepoKey,
    resolveRobustBranch: (dir, requested) => resolveRobustBranchInWorker(dir, requested),
    ensureFullClone: ({ repoId, branch, depth }) => ensureFullClone({ repoId, branch, depth }),
    getAuthCallback,
    getConfiguredAuthHosts,
    getProviderFs: (g) => getProviderFs(g)
  });
}

/**
 * Clone and fork a repository
 */
const cloneAndFork = async ({
  sourceUrl,
  targetHost,
  targetToken,
  targetUsername,
  targetRepo,
  nostrPrivateKey,
  relays
}: {
  sourceUrl: string;
  targetHost: 'github' | 'gitlab' | 'gitea';
  targetToken: string;
  targetUsername: string;
  targetRepo: string;
  nostrPrivateKey: Uint8Array;
  relays: string[];
}) => {
  const dir = `${rootDir}/${sourceUrl}`;
  const authCallback = getAuthCallback(sourceUrl);
  await git.clone({
    dir,
    url: sourceUrl,
    singleBranch: true,
    depth: 1,
    ...(authCallback && { onAuth: authCallback })
  });

  const remoteUrl = await createRemoteRepoLegacy(
    targetHost,
    targetToken,
    targetUsername,
    targetRepo
  );

  //await git.addRemote({ dir, remote: 'origin', url: remoteUrl });
  // Get origin remote URL for push
  const remotes = await git.listRemotes({ dir });
  const originRemote = remotes.find((r: any) => r.remote === 'origin');

  if (originRemote && originRemote.url) {
    // Use robust branch resolution instead of hardcoded 'main'
    const resolvedBranch = await resolveRobustBranchInWorker(dir);
    const authCallback = getAuthCallback(originRemote.url);
    await git.push({
      dir,
      url: originRemote.url,
      ref: resolvedBranch,
      force: true,
      ...(authCallback && { onAuth: authCallback })
    });
  } else {
    console.warn('Origin remote not found or has no URL, skipping push');
  }

  const event = finalizeEvent(
    {
      kind: 34,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', sourceUrl],
        ['e', remoteUrl],
        ['t', 'fork']
      ],
      content: `Forked ${sourceUrl} to ${remoteUrl}`
    },
    nostrPrivateKey
  );

  const pool = new SimplePool();
  await Promise.all(pool.publish(relays, event));

  return remoteUrl;
};

/**
 * Create a remote repository using the multi-vendor GitProvider system
 */
const createRemoteRepoWithVendor = async (
  targetHost: string,
  token: string,
  user: string,
  repo: string,
  options: {
    description?: string;
    isPrivate?: boolean;
    hasIssues?: boolean;
    hasWiki?: boolean;
    autoInit?: boolean;
    licenseTemplate?: string;
    gitignoreTemplate?: string;
  } = {}
): Promise<string> => {
  const { getMultiVendorGitProvider } = await import('../git-provider.js');
  const gitProvider = getMultiVendorGitProvider();

  // Set the token for this host
  gitProvider.setTokens([{ host: targetHost, token }]);

  try {
    const repoMetadata = await gitProvider.createRemoteRepo(repo, {
      ...options,
      targetHost
    });

    return repoMetadata.cloneUrl;
  } catch (error) {
    throw new Error(
      `Failed to create repository on ${targetHost}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

// Keep legacy function for backward compatibility
const createRemoteRepoLegacy = async (
  host: string,
  token: string,
  user: string,
  repo: string
): Promise<string> => {
  return createRemoteRepoWithVendor(host, token, user, repo);
};

/**
 * Reset local repository to match remote HEAD state
 * This performs a hard reset to remove any local commits that diverge from remote
 */
const resetRepoToRemote = async ({ repoId, branch }: { repoId: string; branch?: string }) => {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  try {
    // Use robust multi-fallback branch resolution
    const targetBranch = await resolveRobustBranchInWorker(dir, branch);

    console.log(`Resetting repository ${repoId} to remote state on branch ${targetBranch}`);

    // Get the remote URL for fetching
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');

    if (!originRemote || !originRemote.url) {
      throw new Error('No origin remote found - cannot reset to remote state');
    }

    // Fetch latest from remote to ensure we have the latest remote state
    const authCallback = getAuthCallback(originRemote.url);
    await git.fetch({
      dir,
      url: originRemote.url,
      ref: targetBranch,
      singleBranch: true,
      ...(authCallback && { onAuth: authCallback })
    });

    // Get the remote HEAD commit
    const remoteRef = `refs/remotes/origin/${targetBranch}`;
    let remoteCommit: string;

    try {
      remoteCommit = await git.resolveRef({ dir, ref: remoteRef });
    } catch (error) {
      // Fallback: try to get remote commit from fetch
      const remoteBranches = await git.listBranches({ dir, remote: 'origin' });
      const remoteBranch = remoteBranches.find((b: string) => b.endsWith(targetBranch));
      if (!remoteBranch) {
        throw new Error(`Remote branch ${targetBranch} not found`);
      }
      remoteCommit = await git.resolveRef({ dir, ref: `refs/remotes/${remoteBranch}` });
    }

    // Reset local branch to match remote commit (hard reset)
    await git.checkout({
      dir,
      ref: remoteCommit,
      force: true // Force checkout to discard local changes
    });

    // Update the local branch reference to point to remote commit
    await git.writeRef({
      dir,
      ref: `refs/heads/${targetBranch}`,
      value: remoteCommit,
      force: true
    });

    // Checkout the branch to make it active
    await git.checkout({
      dir,
      ref: targetBranch
    });

    console.log(`Repository ${repoId} successfully reset to remote commit ${remoteCommit}`);

    return {
      success: true,
      repoId,
      branch: targetBranch,
      remoteCommit,
      message: `Repository reset to remote state`
    };
  } catch (error) {
    console.error(`Error resetting repository ${repoId} to remote:`, error);
    return {
      success: false,
      repoId,
      branch,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Create a new local git repository with initial files
 */
const createLocalRepo = async ({
  repoId,
  name,
  description,
  defaultBranch = 'main',
  initializeWithReadme = true,
  gitignoreTemplate = 'none',
  licenseTemplate = 'none',
  authorName,
  authorEmail
}: {
  repoId: string;
  name: string;
  description?: string;
  defaultBranch?: string;
  initializeWithReadme?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
  authorName: string;
  authorEmail: string;
}) => {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  try {
    console.log(`Creating local repository: ${name}`);

    // Initialize git repository
    await git.init({ dir, defaultBranch });

    // Create initial files based on options
    const files: Array<{ path: string; content: string }> = [];

    // README.md
    if (initializeWithReadme) {
      const readmeContent = `# ${name}\n\n${description || 'A new repository created with Flotilla-Budabit'}\n`;
      files.push({ path: 'README.md', content: readmeContent });
    }

    // .gitignore
    if (gitignoreTemplate !== 'none') {
      const gitignoreContent = await getGitignoreTemplate(gitignoreTemplate);
      files.push({ path: '.gitignore', content: gitignoreContent });
    }

    // LICENSE
    if (licenseTemplate !== 'none') {
      const licenseContent = await getLicenseTemplate(licenseTemplate, authorName);
      files.push({ path: 'LICENSE', content: licenseContent });
    }

    // Write files to repository using the file system via provider fs
    // Debug provider and FS info
    try {
      const providerInfo = {
        providerCtor: (git as any)?.constructor?.name,
        hasFsPropOnProvider: Boolean((git as any)?.fs),
        providerFsCtor: (git as any)?.fs?.constructor?.name
      };
      console.log('[git-worker] Provider info:', providerInfo);
    } catch {}

    const fs = getProviderFs(git);
    try {
      const fsInfo = {
        hasFs: Boolean(fs),
        fsCtor: fs && (fs as any).constructor?.name,
        hasPromises: Boolean(fs && (fs as any).promises),
        promisesKeys: fs && (fs as any).promises ? Object.keys((fs as any).promises) : [],
        isLightningHint: Boolean(
          fs &&
            ((fs as any).__isLightningFS ||
              ((fs as any).constructor?.name || '').toLowerCase().includes('lightning'))
        )
      };
      console.log('[git-worker] FS info:', fsInfo);
    } catch {}

    if (!fs || !fs.promises) {
      throw new Error(
        'File system provider is not available in the current environment. Cannot create initial files.'
      );
    }
    for (const file of files) {
      const filePath = `${dir}/${file.path}`;

      // Ensure the directory exists
      const pathParts = file.path.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        const fullDirPath = `${dir}/${dirPath}`;

        try {
          // Create directory structure if it doesn't exist
          const { ensureDir } = await import('./fs-utils.js');
          await ensureDir(fs, fullDirPath);
        } catch (error) {
          // Directory might already exist, that's fine
        }
      }

      let finalContent: string = '';

      if (file.path === 'README.md') {
        finalContent = file.content;
      } else if (file.path === '.gitignore') {
        finalContent = file.content;
      } else if (file.path === 'LICENSE') {
        finalContent = file.content;
      }

      await fs.promises.writeFile(filePath, finalContent, 'utf8');
      await git.add({ dir, filepath: file.path });
    }

    // Create initial commit
    const commitSha = await git.commit({
      dir,
      message: 'Initial commit',
      author: {
        name: authorName,
        email: authorEmail
      }
    });

    // Update tracking using canonical key
    clonedRepos.add(key);
    repoDataLevels.set(key, 'full');

    console.log(`Local repository created successfully: ${commitSha}`);

    return {
      success: true,
      repoId,
      commitSha,
      files: files.map((f) => f.path)
    };
  } catch (error) {
    console.error(`Error creating local repository ${repoId}:`, error);
    return {
      success: false,
      repoId,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Create a remote repository using Git provider API
 */
/**
 * Flag to indicate if event signing is available
 */
let eventSigningAvailable = false;

/**
 * Counter for request IDs
 */
let requestIdCounter = 0;

/**
 * Map of pending signing requests
 */
const pendingSigningRequests = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason: any) => void }
>();

/**
 * Set up message handler for event signing responses
 */
self.addEventListener('message', (event) => {
  if (event.data.type === 'register-event-signer') {
    // UI thread is registering as an event signer
    console.log('UI thread registered as event signer');
    eventSigningAvailable = true;
  } else if (event.data.type === 'event-signed') {
    // UI thread has signed an event
    const { requestId, signedEvent } = event.data;
    const pendingRequest = pendingSigningRequests.get(requestId);

    if (pendingRequest) {
      console.log('Received signed event for request:', requestId);
      pendingRequest.resolve(signedEvent);
      pendingSigningRequests.delete(requestId);
    } else {
      console.warn('Received signed event for unknown request:', requestId);
    }
  } else if (event.data.type === 'event-signing-error') {
    // UI thread encountered an error signing an event
    const { requestId, error } = event.data;
    const pendingRequest = pendingSigningRequests.get(requestId);

    if (pendingRequest) {
      console.error('Event signing error for request:', requestId, error);
      pendingRequest.reject(new Error(error));
      pendingSigningRequests.delete(requestId);
    } else {
      console.warn('Received signing error for unknown request:', requestId);
    }
  }
});

/**
 * Request event signing from the UI thread
 * This function will be called by the GRASP API when it needs to sign an event
 */
const requestEventSigning = async (event: any): Promise<any> => {
  if (!eventSigningAvailable) {
    throw new Error('Event signing is not available. Register an event signer first.');
  }

  // Generate a unique request ID
  const requestId = `${Date.now()}-${requestIdCounter++}`;
  console.log('Requesting event signing from UI thread, request ID:', requestId);

  // Create a promise that will be resolved when the UI thread responds
  const signedEventPromise = new Promise<any>((resolve, reject) => {
    pendingSigningRequests.set(requestId, { resolve, reject });
  });

  // Send a message to the UI thread to request signing
  // The UI thread will respond with a message containing the signed event
  self.postMessage({
    type: 'request-event-signing',
    requestId,
    event
  });

  // Wait for the UI thread to respond
  return await signedEventPromise;
};

/**
 * Set the event signing function from the UI thread
 *
 * Note: This is now just a compatibility function that does nothing
 * The actual signing is done via message passing
 */
const setEventSigner = (enabled: boolean) => {
  console.log('setEventSigner called with:', enabled);
  return { success: true };
};

/**
 * Set the handler for signing events
 * This is now just a compatibility function that does nothing
 * The actual signing is done via message passing
 */
const setRequestEventSigningHandler = (handler: any) => {
  console.log('setRequestEventSigningHandler called');
  return { success: true };
};

const createRemoteRepo = async ({
  provider,
  token,
  name,
  description,
  isPrivate = false,
  baseUrl,
  eventTemplates
}: {
  provider: GitVendor;
  token: string;
  name: string;
  description?: string;
  isPrivate?: boolean;
  baseUrl?: string;
  eventTemplates?: any[];
}) => {
  try {
    console.log(`Creating remote repository on ${provider}: ${name}`);
    console.log(`Token provided: ${token ? 'YES (length: ' + token.length + ')' : 'NO/EMPTY'}`);

    if (!token || token.trim() === '') {
      throw new Error('No authentication token provided');
    }

    // Use GitServiceApi abstraction instead of hardcoded API calls
    let api;

    if (provider === 'grasp') {
      if (!baseUrl) {
        throw new Error('GRASP provider requires a relay URL as baseUrl parameter');
      }

      // For GRASP, we need to create a special signer that uses our message-based protocol
      const messageSigner = {
        signEvent: async (event: any) => {
          if (!requestEventSigning) {
            throw new Error('Event signing function not registered. Call setEventSigner first.');
          }
          return await requestEventSigning(event);
        },
        getPublicKey: async () => {
          // For GRASP, the token is the pubkey
          return token;
        }
      };

      api = getGitServiceApi(provider, token, baseUrl, messageSigner);
    } else {
      // Standard Git providers
      api = getGitServiceApi(provider, token, baseUrl);
    }

    // Create repository using unified API
    const repoMetadata = await api.createRepo({
      name,
      description,
      private: isPrivate,
      autoInit: false // We'll push our own initial commit
    });

    let remoteUrl = repoMetadata.cloneUrl;
    // For GRASP, ensure clone URL uses HTTP(S) scheme, not WS(S)
    if (provider === 'grasp') {
      remoteUrl = remoteUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
    }

    console.log(`Remote repository created: ${remoteUrl}`);

    return {
      success: true,
      remoteUrl,
      provider
    };
  } catch (error) {
    console.error(`Error creating remote repository:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Push local repository to remote
 */
const pushToRemote = async ({
  repoId,
  remoteUrl,
  branch = 'main',
  token,
  provider
}: {
  repoId: string;
  remoteUrl: string;
  branch?: string;
  token?: string;
  provider?: GitVendor;
}) => {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  try {
    console.log(`Pushing repository ${repoId} to remote: ${remoteUrl} (provider=${provider})`);

    // Handle GRASP provider with GraspApi
    if (provider === 'grasp') {
      if (!token) {
        throw new Error('GRASP provider requires a pubkey token');
      }

      // For GRASP, we need to create a special signer that uses our message-based protocol
      const messageSigner = {
        signEvent: async (event: any) => {
          if (typeof requestEventSigning !== 'function') {
            throw new Error('Event signing function not registered. Call setEventSigner first.');
          }
          return await requestEventSigning(event);
        },
        getPublicKey: async () => {
          // For GRASP, the token is the pubkey
          return token;
        }
      };

      // For GRASP, we use the GraspApi instead of isomorphic-git
      // The GraspApi handles the Git Smart HTTP protocol and event signing
      // Ensure we construct GraspApi with the BASE relay URL (ws/wss origin), not a pathful clone URL
      let relayBaseUrl = remoteUrl;
      try {
        const u = new URL(remoteUrl);
        // Build origin without path
        const origin = `${u.protocol}//${u.host}`;
        // Ensure nostr-tools sees ws/wss protocol for the relay
        const wsOrigin = origin.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
        relayBaseUrl = wsOrigin;
      } catch (_) {
        // If URL parsing fails, fallback to replacing any http(s) with ws(s) and trimming after host
        relayBaseUrl = remoteUrl
          .replace(/^http:\/\//, 'ws://')
          .replace(/^https:\/\//, 'wss://')
          .replace(/(ws[s]?:\/\/[^/]+).*/, '$1');
      }

      console.log(`[GRASP] Using relay base URL for API:`, relayBaseUrl);
      const graspApi = getGitServiceApi('grasp', token, relayBaseUrl, messageSigner);

      // For GRASP push operations, we need to create and publish repository state events
      // First, read the repository state (branches, HEAD, etc.)
      console.log('Reading repository state for GRASP push');

      // Get the current HEAD commit
      const headCommit = await git.resolveRef({ dir, ref: 'HEAD' });

      // Get all branches
      const branchNames = await git.listBranches({ dir });

      // Convert branches to the format expected by createRepoStateEvent
      const refs = [];
      for (const branchName of branchNames) {
        try {
          const branchCommit = await git.resolveRef({ dir, ref: `refs/heads/${branchName}` });
          refs.push({
            type: 'heads' as const,
            name: branchName,
            commit: branchCommit
          });
        } catch (error) {
          console.warn(`Failed to resolve commit for branch ${branchName}:`, error);
        }
      }

      // Determine the current branch (HEAD reference)
      // We need to find which branch points to the same commit as HEAD
      let currentBranch: string | undefined;
      try {
        const headCommit = await git.resolveRef({ dir, ref: 'HEAD' });
        // Check each branch to see which one matches HEAD
        for (const branchName of branchNames) {
          try {
            const branchCommit = await git.resolveRef({ dir, ref: `refs/heads/${branchName}` });
            if (branchCommit === headCommit) {
              currentBranch = branchName;
              break;
            }
          } catch (error) {
            // Continue to next branch if this one fails
            continue;
          }
        }
      } catch (error) {
        console.warn('Failed to determine current branch from HEAD:', error);
      }

      // Create the repository state event
      const repoStateEvent = createRepoStateEvent({
        repoId,
        refs,
        head: currentBranch,
        created_at: Math.floor(Date.now() / 1000)
      });

      // Sign the event using the message-based signing protocol
      const signedEvent = await messageSigner.signEvent(repoStateEvent);

      // Publish the event to the relay
      // Derive the relay base ws(s) origin from remoteUrl
      let relayUrl: string = remoteUrl;
      try {
        const u = new URL(remoteUrl);
        const origin = `${u.protocol}//${u.host}`;
        relayUrl = origin.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
      } catch (_) {
        // Fallback: convert protocol and strip path
        relayUrl = remoteUrl
          .replace(/^http:\/\//, 'ws://')
          .replace(/^https:\/\//, 'wss://')
          .replace(/(ws[s]?:\/\/[^/]+).*/, '$1');
      }
      console.log(`[GRASP] Publishing repo state to relay:`, relayUrl);
      const pool = new SimplePool();
      await Promise.all(pool.publish([relayUrl], signedEvent));

      console.log('Successfully published repository state event to GRASP relay');

      // Also push actual Git objects to the HTTPS remote so the repo is not empty
      try {
        // Ensure remote exists (idempotent)
        try {
          await git.addRemote({ dir, remote: 'origin', url: remoteUrl });
        } catch (_) {
          // Remote may already exist; ignore
        }

        console.log(`[GRASP] Pushing packfiles over HTTPS to ${remoteUrl} (ref=${branch})`);
        await git.push({
          dir,
          url: remoteUrl,
          ref: branch,
          force: true
        });
        console.log('[GRASP] Git objects pushed successfully');
      } catch (pushErr) {
        console.warn('[GRASP] Failed to push packfiles over HTTPS:', pushErr);
        // We still return success because state event was published; caller may choose to sync and retry push
      }

      // Return success result
      return {
        success: true,
        repoId,
        remoteUrl,
        branch
      };
    } else {
      // Standard Git providers - use isomorphic-git
      // Add remote origin
      await git.addRemote({
        dir,
        remote: 'origin',
        url: remoteUrl
      });

      // Get auth callback if token provided
      const authCallback = token
        ? () => ({ username: 'token', password: token })
        : getAuthCallback(remoteUrl);

      // Push to remote (use URL directly and force flag like working patch push)
      await git.push({
        dir,
        url: remoteUrl,
        ref: branch,
        force: true, // Allow non-fast-forward pushes
        ...(authCallback && { onAuth: authCallback })
      });
    }

    console.log(`Successfully pushed to remote: ${remoteUrl}`);

    return {
      success: true,
      repoId,
      remoteUrl,
      branch
    };
  } catch (error) {
    console.error(`Error pushing to remote:`, error);
    return {
      success: false,
      repoId,
      remoteUrl,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/**
 * Get .gitignore template content
 */
async function getGitignoreTemplate(template: string): Promise<string> {
  const templates: Record<string, string> = {
    node: `# Dependencies\nnode_modules/\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n\n# Runtime data\npids\n*.pid\n*.seed\n*.pid.lock\n\n# Coverage directory used by tools like istanbul\ncoverage/\n\n# nyc test coverage\n.nyc_output\n\n# Grunt intermediate storage\n.grunt\n\n# Bower dependency directory\nbower_components\n\n# node-waf configuration\n.lock-wscript\n\n# Compiled binary addons\nbuild/Release\n\n# Dependency directories\nnode_modules/\njspm_packages/\n\n# Optional npm cache directory\n.npm\n\n# Optional REPL history\n.node_repl_history\n\n# Output of 'npm pack'\n*.tgz\n\n# Yarn Integrity file\n.yarn-integrity\n\n# dotenv environment variables file\n.env\n\n# next.js build / generate output\n.next\nout\n\n# nuxt.js build / generate output\n.nuxt\ndist\n\n# Gatsby files\n.cache/\npublic\n\n# vuepress build output\n.vuepress/dist\n\n# Serverless directories\n.serverless\n\n# FuseBox cache\n.fusebox/`,
    python: `# Byte-compiled / optimized / DLL files\n__pycache__/\n*.py[cod]\n*$py.class\n\n# C extensions\n*.so\n\n# Distribution / packaging\n.Python\nbuild/\ndevelop-eggs/\ndist/\ndownloads/\neggs/\n.eggs/\nlib/\nlib64/\nparts/\nsdist/\nvar/\nwheels/\n*.egg-info/\n.installed.cfg\n*.egg\nPYTHON_ARGCOMPLETE_OK\n\n# PyInstaller\n*.manifest\n*.spec\n\n# Installer logs\npip-log.txt\npip-delete-this-directory.txt\n\n# Unit test / coverage reports\nhtmlcov/\n.tox/\n.coverage\n.coverage.*\n.cache\nnosetests.xml\ncoverage.xml\n*.cover\n.hypothesis/\n.pytest_cache/\n\n# Translations\n*.mo\n*.pot\n\n# Django stuff:\n*.log\nlocal_settings.py\ndb.sqlite3\n\n# Flask stuff:\ninstance/\n.webassets-cache\n\n# Scrapy stuff:\n.scrapy\n\n# Sphinx documentation\ndocs/_build/\n\n# PyBuilder\ntarget/\n\n# Jupyter Notebook\n.ipynb_checkpoints\n\n# pyenv\n.python-version\n\n# celery beat schedule file\ncelerybeat-schedule\n\n# SageMath parsed files\n*.sage.py\n\n# Environments\n.env\n.venv\nenv/\nvenv/\nENV/\nenv.bak/\nvenv.bak/\n\n# Spyder project settings\n.spyderproject\n.spyproject\n\n# Rope project settings\n.ropeproject\n\n# mkdocs documentation\n/site\n\n# mypy\n.mypy_cache/`,
    web: `# Logs\nlogs\n*.log\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\n\n# Runtime data\npids\n*.pid\n*.seed\n*.pid.lock\n\n# Directory for instrumented libs generated by jscoverage/JSCover\nlib-cov\n\n# Coverage directory used by tools like istanbul\ncoverage\n\n# nyc test coverage\n.nyc_output\n\n# Grunt intermediate storage (http://gruntjs.com/creating-plugins#storing-task-files)\n.grunt\n\n# Bower dependency directory (https://bower.io/)\nbower_components\n\n# node-waf configuration\n.lock-wscript\n\n# Compiled binary addons (https://nodejs.org/api/addons.html)\nbuild/Release\n\n# Dependency directories\nnode_modules/\njspm_packages/\n\n# Optional npm cache directory\n.npm\n\n# Optional REPL history\n.node_repl_history\n\n# Output of 'npm pack'\n*.tgz\n\n# Yarn Integrity file\n.yarn-integrity\n\n# dotenv environment variables file\n.env\n\n# next.js build / generate output\n.next\nout\n\n# nuxt.js build / generate output\n.nuxt\ndist\n\n# Gatsby files\n.cache/\npublic\n\n# vuepress build output\n.vuepress/dist\n\n# Serverless directories\n.serverless\n\n# FuseBox cache\n.fusebox/`,
    svelte: `# Dependencies\nnode_modules/\n\n# Production build\n/build/\n/dist/\n\n# Generated files\n.svelte-kit/\n\n# Environment variables\n.env\n.env.local\n.env.*.local\n\n# Log files\nnpm-debug.log*\nyarn-debug.log*\nyarn-error.log*\npnpm-debug.log*\nlerna-debug.log*\n\n# Editor directories and files\n.vscode/*\n!.vscode/extensions.json\n.idea\n*.suo\n*.ntvs*\n*.njsproj\n*.sln\n*.sw?\n\n# OS generated files\n.DS_Store\n.DS_Store?\n._*\n.Spotlight-V100\n.Trashes\nehthumbs.db\nThumbs.db`
  };

  return templates[template] || '';
}

/**
 * Get license template content
 */
async function getLicenseTemplate(template: string, authorName: string): Promise<string> {
  const currentYear = new Date().getFullYear();

  const templates: Record<string, string> = {
    mit: `MIT License\n\nCopyright (c) ${currentYear} ${authorName}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.`,
    'apache-2.0': `Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n\nTERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION\n\n1. Definitions.\n\n"License" shall mean the terms and conditions for use, reproduction,\nand distribution as defined by Sections 1 through 9 of this document.\n\n"Licensor" shall mean the copyright owner or entity granting the License.\n\n"Legal Entity" shall mean the union of the acting entity and all\nother entities that control, are controlled by, or are under common\ncontrol with that entity. For the purposes of this definition,\n"control" means (i) the power, direct or indirect, to cause the\ndirection or management of such entity, whether by contract or\notherwise, or (ii) ownership of fifty percent (50%) or more of the\noutstanding shares, or (iii) beneficial ownership of such entity.\n\n"You" (or "Your") shall mean an individual or Legal Entity\nexercising permissions granted by this License.\n\n"Source" form shall mean the preferred form for making modifications,\nincluding but not limited to software source code, documentation\nsource, and configuration files.\n\n"Object" form shall mean any form resulting from mechanical\ntransformation or translation of a Source form, including but\nnot limited to compiled object code, generated documentation,\nand conversions to other media types.\n\n"Work" shall mean the work of authorship, whether in Source or\nObject form, made available under the License, as indicated by a\ncopyright notice that is included in or attached to the work\n(which shall not include communication that is conspicuously\nmarked or otherwise designated in writing by the copyright owner\nas "Not a Contribution").\n\n"Contribution" shall mean any work of authorship, including\nthe original version of the Work and any modifications or additions\nto that Work or Derivative Works thereof, that is intentionally\nsubmitted to Licensor for inclusion in the Work by the copyright owner\nor by an individual or Legal Entity authorized to submit on behalf of\nthe copyright owner. For the purposes of this definition, "submitted"\nmeans any form of electronic, verbal, or written communication sent\nto the Licensor or its representatives, including but not limited to\ncommunication on electronic mailing lists, source code control\nsystems, and issue tracking systems that are managed by, or on behalf\nof, the Licensor for the purpose of discussing and improving the Work,\nbut excluding communication that is conspicuously marked or otherwise\ndesignated in writing by the copyright owner as "Not a Contribution."\n\n2. Grant of Copyright License. Subject to the terms and conditions of\nthis License, each Contributor hereby grants to You a perpetual,\nworldwide, non-exclusive, no-charge, royalty-free, irrevocable\ncopyright license to use, reproduce, modify, distribute, and prepare\nDerivative Works of, publicly display, publicly perform, sublicense,\nand distribute the Work and such Derivative Works in Source or Object\nform.\n\n3. Grant of Patent License. Subject to the terms and conditions of\nthis License, each Contributor hereby grants to You a perpetual,\nworldwide, non-exclusive, no-charge, royalty-free, irrevocable\n(except as stated in this section) patent license to make, have made,\nuse, offer to sell, sell, import, and otherwise transfer the Work,\nwhere such license applies only to those patent claims licensable\nby such Contributor that are necessarily infringed by their\nContribution(s) alone or by combination of their Contribution(s)\nwith the Work to which such Contribution(s) was submitted. If You\ninstitute patent litigation against any entity (including a\ncross-claim or counterclaim in a lawsuit) alleging that the Work\nor a Contribution incorporated within the Work constitutes direct\nor contributory patent infringement, then any patent licenses\ngranted to You under this License for that Work shall terminate\nas of the date such litigation is filed.\n\n4. Redistribution. You may reproduce and distribute copies of the\nWork or Derivative Works thereof in any medium, with or without\nmodifications, and in Source or Object form, provided that You\nmeet the following conditions:\n\n(a) You must give any other recipients of the Work or\nDerivative Works a copy of this License; and\n\n(b) You must cause any modified files to carry prominent notices\nstating that You changed the files; and\n\n(c) You must retain, in the Source form of any Derivative Works\nthat You distribute, all copyright, trademark, patent,\nattribution notices from the Source form of the Work,\nexcluding those notices that do not pertain to any part of\nthe Derivative Works; and\n\n(d) If the Work includes a "NOTICE" text file as part of its\ndistribution, then any Derivative Works that You distribute must\ninclude a readable copy of the attribution notices contained\nwithin such NOTICE file, excluding those notices that do not\npertain to any part of the Derivative Works, in at least one\nof the following places: within a NOTICE text file distributed\nas part of the Derivative Works; within the Source form or\ndocumentation, if provided along with the Derivative Works; or,\nwithin a display generated by the Derivative Works, if and\nwherever such third-party notices normally appear. The contents\nof the NOTICE file are for informational purposes only and\ndo not modify the License. You may add Your own attribution\nnotices within Derivative Works that You distribute, alongside\nor as an addendum to the NOTICE text from the Work, provided\nthat such additional attribution notices cannot be construed\nas modifying the License.\n\nYou may add Your own copyright notice to Your modifications and\nmay provide additional or different license terms and conditions\nfor use, reproduction, or distribution of Your modifications, or\nfor any such Derivative Works as a whole, provided Your use,\nreproduction, and distribution of the Work otherwise complies with\nthe conditions stated in this License.\n\n5. Submission of Contributions. Unless You explicitly state otherwise,\nany Contribution intentionally submitted for inclusion in the Work\nby You to the Licensor shall be under the terms and conditions of\nthis License, without any additional terms or conditions.\nNotwithstanding the above, nothing herein shall supersede or modify\nthe terms of any separate license agreement you may have executed\nwith Licensor regarding such Contributions.\n\n6. Trademarks. This License does not grant permission to use the trade\nnames, trademarks, service marks, or product names of the Licensor,\nexcept as required for reasonable and customary use in describing the\norigin of the Work and reproducing the content of the NOTICE file.\n\n7. Disclaimer of Warranty. Unless required by applicable law or\nagreed to in writing, Licensor provides the Work (and each\nContributor provides its Contributions) on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or\nimplied, including, without limitation, any warranties or conditions\nof TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A\nPARTICULAR PURPOSE. You are solely responsible for determining the\nappropriateness of using or redistributing the Work and assume any\nrisks associated with Your exercise of permissions under this License.\n\n8. Limitation of Liability. In no event and under no legal theory,\nwhether in tort (including negligence), contract, or otherwise,\nunless required by applicable law (such as deliberate and grossly\nnegligent acts) or agreed to in writing, shall any Contributor be\nliable to You for damages, including any direct, indirect, special,\nincidental, or consequential damages of any character arising as a\nresult of this License or out of the use or inability to use the\nWork (including but not limited to damages for loss of goodwill,\nwork stoppage, computer failure or malfunction, or any and all\nother commercial damages or losses), even if such Contributor\nhas been advised of the possibility of such damages.\n\n9. Accepting Warranty or Support. You may choose to offer, and to\ncharge a fee for, warranty, support, indemnity or other liability\nobligations and/or rights consistent with this License. However, in\naccepting such obligations, You may act only on Your own behalf and on\nYour sole responsibility, not on behalf of any other Contributor, and\nonly if You agree to indemnify, defend, and hold each Contributor\nharmless for any liability incurred by, or claims asserted against,\nsuch Contributor by reason of your accepting any such warranty or support.\n\nEND OF TERMS AND CONDITIONS\n\nCopyright ${currentYear} ${authorName}\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\nhttp://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.`
  };

  return templates[template] || '';
}

/**
 * Clone a remote repository with progress tracking
 * Supports both shallow and full clones with authentication
 */
async function cloneRemoteRepo(options: {
  url: string;
  depth?: number;
  dir: string;
  token?: string;
  onProgress?: (stage: string, pct?: number) => void;
}): Promise<void> {
  // Delegate to extracted util to keep behavior identical
  await cloneRemoteRepoUtil(git, cacheManager, options);
}

/**
 * Fork and clone a repository using GitHub API and isomorphic-git
 * This creates a remote fork via API, polls until ready, then clones locally
 */
async function forkAndCloneRepo(options: {
  owner: string;
  repo: string;
  forkName: string;
  visibility: 'public' | 'private';
  token: string;
  dir: string;
  provider?: string;
  baseUrl?: string; // For GRASP relay URL
  onProgress?: (stage: string, pct?: number) => void;
}): Promise<{
  success: boolean;
  repoId: string;
  forkUrl: string;
  defaultBranch: string;
  branches: string[];
  tags: string[];
  error?: string;
}> {
  const {
    owner,
    repo,
    forkName,
    visibility,
    token,
    dir,
    provider = 'github',
    baseUrl,
    onProgress
  } = options;

  try {
    onProgress?.('Creating remote fork...', 10);

    // Validate inputs early to avoid confusing API errors
    const ownerValid = typeof owner === 'string' && owner.trim().length > 0;
    const repoValid = typeof repo === 'string' && repo.trim().length > 0;
    const forkValid = typeof forkName === 'string' && forkName.trim().length > 0;
    if (!ownerValid || !repoValid || !forkValid) {
      throw new Error(
        `Invalid parameters for fork: owner="${owner}", repo="${repo}", forkName="${forkName}"`
      );
    }

    console.log('[forkAndCloneRepo] Input params', {
      provider,
      baseUrl,
      owner,
      repo,
      forkName,
      visibility,
      dir
    });

    // Step 1: Create remote fork using GitServiceApi abstraction
    const { getGitServiceApi } = await import('../git/factory.js');
    const gitServiceApi = getGitServiceApi(provider as any, token, baseUrl);

    // Determine source URL based on provider (for diagnostics only)
    const providerHost =
      provider === 'github'
        ? 'github.com'
        : provider === 'gitlab'
          ? 'gitlab.com'
          : provider === 'gitea'
            ? 'gitea.com'
            : provider === 'bitbucket'
              ? 'bitbucket.org'
              : 'github.com';

    const sourceUrl = `https://${providerHost}/${owner}/${repo}`;
    console.log('[forkAndCloneRepo] Creating fork via API', { sourceUrl });

    let forkResult;
    try {
      forkResult = await gitServiceApi.forkRepo(owner, repo, { name: forkName });
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[forkAndCloneRepo] forkRepo failed', {
        owner,
        repo,
        forkName,
        provider,
        baseUrl,
        error: msg
      });
      throw e;
    }

    // Check if the fork name was honored
    if (forkResult.name !== forkName) {
      throw new Error(
        `Fork already exists with name "${forkResult.name}". ${provider} does not support renaming existing forks. Please delete the existing fork first or choose a different name.`
      );
    }
    const forkOwner = forkResult.owner;
    let forkUrl = forkResult.cloneUrl;
    console.log('[forkAndCloneRepo] Fork created', {
      forkOwner: forkOwner?.login,
      forkName: forkResult?.name,
      forkFullName: forkResult?.fullName,
      forkCloneUrl: forkUrl
    });

    onProgress?.('Waiting for fork to be ready...', 30);

    // Step 2: Poll until fork is ready (Git providers need time to create the fork)
    let pollAttempts = 0;
    const maxPollAttempts = 30; // 30 seconds max

    // Use GitServiceApi abstraction for fork polling
    const api = gitServiceApi; // Reuse the same API instance

    while (pollAttempts < maxPollAttempts) {
      try {
        // Use GitServiceApi to check if fork is ready
        const repoMetadata = await api.getRepo(forkOwner.login, forkName);

        if (repoMetadata && repoMetadata.id) {
          break; // Fork is ready
        }
      } catch (error: any) {
        // Repository not found yet, continue polling
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          // 404 means fork not ready yet, continue polling
        } else {
          console.error('[forkAndCloneRepo] Unexpected error while polling fork readiness', {
            error: error?.message || String(error)
          });
          throw error; // Unexpected error
        }
      }

      pollAttempts++;
      onProgress?.(
        `Waiting for fork... (${pollAttempts}/${maxPollAttempts})`,
        30 + (pollAttempts / maxPollAttempts) * 20
      );
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
    }

    if (pollAttempts >= maxPollAttempts) {
      throw new Error('Fork creation timed out. The fork may still be processing.');
    }

    onProgress?.('Cloning fork locally...', 60);

    // Step 3: Clone the fork locally using existing cloneRemoteRepo logic
    // For GRASP, convert ws(s) relay scheme to http(s) for Smart HTTP
    const cloneUrl =
      provider === 'grasp'
        ? forkUrl.replace('ws://', 'http://').replace('wss://', 'https://')
        : forkUrl;

    console.log('[forkAndCloneRepo] Cloning', { cloneUrl, dir });

    await cloneRemoteRepo({
      url: cloneUrl,
      dir,
      depth: 0, // Full clone for forks
      token,
      onProgress: (message: string, percentage?: number) => {
        onProgress?.(message, 60 + (percentage || 0) * 0.35); // Scale to 60-95%
      }
    });

    onProgress?.('Gathering repository metadata...', 95);

    // Get repository metadata after successful clone
    const defaultBranch = await resolveRobustBranchInWorker(dir);
    const branches = await git.listBranches({ dir });
    const tags = await git.listTags({ dir });

    onProgress?.('Fork completed successfully!', 100);

    return {
      success: true,
      repoId: `${owner}/${forkName}`,
      forkUrl,
      defaultBranch,
      branches,
      tags
    };
  } catch (error: any) {
    console.error('Fork and clone failed:', error, {
      provider,
      baseUrl,
      owner,
      repo,
      forkName
    });

    // Cleanup partial clone on error
    try {
      const fs: any = (git as any).fs;
      await fs?.promises?.rmdir?.(dir).catch?.(() => {}); // Best effort cleanup
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      repoId: '',
      forkUrl: '',
      defaultBranch: '',
      branches: [],
      tags: [],
      error: error.response?.data?.message || error.message || 'Fork operation failed'
    };
  }
}

/**
 * Update remote repository metadata via GitHub API
 * Updates name, description, and/or visibility of a remote repository
 */
async function updateRemoteRepoMetadata(options: {
  owner: string;
  repo: string;
  updates: {
    name?: string;
    description?: string;
    private?: boolean;
  };
  token: string;
}): Promise<{
  success: boolean;
  updatedRepo?: any;
  error?: string;
}> {
  const { owner, repo, updates, token } = options;

  try {
    console.log(`Updating remote repository metadata for ${owner}/${repo}...`);

    // Use GitServiceApi abstraction instead of hardcoded GitHub API calls
    const api = getGitServiceApi('github', token);

    // Update repository using unified API
    const updatedRepo = await api.updateRepo(owner, repo, {
      name: updates.name,
      description: updates.description,
      private: updates.private
    });

    console.log(`Successfully updated remote repository metadata`);

    return {
      success: true,
      updatedRepo
    };
  } catch (error: any) {
    console.error('Update remote repository metadata failed:', error);

    return {
      success: false,
      error:
        error.response?.data?.message || error.message || 'Failed to update repository metadata'
    };
  }
}

/**
 * Update and push files to a repository
 * Updates local files, commits changes, and pushes to remote
 */
async function updateAndPushFiles(options: {
  dir: string;
  files: Array<{ path: string; content: string }>;
  commitMessage: string;
  token: string;
  provider?: GitVendor;
  onProgress?: (stage: string) => void;
}): Promise<{
  success: boolean;
  commitId?: string;
  error?: string;
}> {
  const { dir, files, commitMessage, token, provider = 'github', onProgress } = options;

  try {
    onProgress?.('Updating local files...');

    // Write files to the local repository via provider fs if available
    const fs: any = (git as any).fs;
    if (!fs?.promises) {
      throw new Error('Filesystem not available from Git provider');
    }
    for (const file of files) {
      const filePath = `${dir}/${file.path}`;
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dirPath && dirPath !== dir) {
        await fs.promises.mkdir(dirPath).catch(() => {});
      }
      await fs.promises.writeFile(filePath, file.content, 'utf8');
    }

    onProgress?.('Staging changes...');

    // Stage all changed files
    for (const file of files) {
      await git.add({ dir, filepath: file.path });
    }

    onProgress?.('Creating commit...');

    // Create commit
    const commitResult = await git.commit({
      dir,
      message: commitMessage,
      author: {
        name: 'Nostr Git User',
        email: 'user@nostr-git.dev'
      }
    });

    onProgress?.('Pushing to remote...');

    // Push to remote with authentication
    const remoteUrl = await git.getConfig({ dir, path: 'remote.origin.url' });

    // Handle GRASP provider with message-based signing
    if (provider === 'grasp') {
      if (!token) {
        throw new Error('GRASP provider requires a pubkey token');
      }

      // For GRASP, we need to create a special signer that uses our message-based protocol
      const messageSigner = {
        signEvent: async (event: any) => {
          if (typeof requestEventSigning !== 'function') {
            throw new Error('Event signing function not registered. Call setEventSigner first.');
          }
          return await requestEventSigning(event);
        },
        getPublicKey: async () => {
          // For GRASP, the token is the pubkey
          return token;
        }
      };

      // For GRASP, we need to use the Git Smart HTTP protocol
      // The signing is handled automatically by the git operations
      // when we provide the proper auth callback
      const authCallback = () => ({
        username: token, // pubkey as username
        password: 'grasp' // placeholder, actual signing is done via message protocol
      });

      // Push to remote using GRASP-specific auth
      await git.push({
        dir,
        onAuth: authCallback,
        force: false
      });
    } else {
      // Standard Git providers
      await git.push({
        dir,
        onAuth: () => ({
          username: 'token',
          password: token
        }),
        force: false
      });
    }

    onProgress?.('Files updated and pushed successfully!');

    return {
      success: true,
      commitId: commitResult
    };
  } catch (error: any) {
    console.error('Update and push files failed:', error);

    return {
      success: false,
      error: error.message || 'Failed to update and push files'
    };
  }
}

/**
 * Get detailed information about a specific commit including metadata and file changes
 */
async function getCommitDetails({
  repoId,
  commitId,
  branch
}: {
  repoId: string;
  commitId: string;
  branch?: string;
}): Promise<{
  success: boolean;
  meta?: {
    sha: string;
    author: string;
    email: string;
    date: number;
    message: string;
    parents: string[];
  };
  changes?: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    diffHunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      patches: Array<{ line: string; type: '+' | '-' | ' ' }>;
    }>;
  }>;
  error?: string;
}> {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;

  try {
    // Ensure we have the repository with sufficient depth
    const cloneResult = await ensureFullClone({ repoId, branch, depth: 100 });
    if (!cloneResult.success) {
      throw new Error(`Failed to ensure repository: ${cloneResult.error}`);
    }

    // Get commit metadata
    const commits = await git.log({
      dir,
      depth: 1,
      ref: commitId
    });

    if (commits.length === 0) {
      throw new Error(`Commit ${commitId} not found`);
    }

    const commit = commits[0];
    const meta = {
      sha: commit.oid,
      author: commit.commit.author.name,
      email: commit.commit.author.email,
      date: commit.commit.author.timestamp * 1000, // Convert to milliseconds
      message: commit.commit.message,
      parents: commit.commit.parent || []
    };

    // Get file changes and diffs
    const changes: Array<{
      path: string;
      status: 'added' | 'modified' | 'deleted' | 'renamed';
      diffHunks: Array<{
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        patches: Array<{ line: string; type: '+' | '-' | ' ' }>;
      }>;
    }> = [];

    // If this is not the initial commit, compare with parent
    if (commit.commit.parent && commit.commit.parent.length > 0) {
      const parentCommit = commit.commit.parent[0];

      // Get the list of changed files
      const changedFiles = await git.walk({
        dir,
        // Use fully resolved OIDs for tree refs to avoid short-SHA resolution issues
        trees: [git.TREE({ ref: parentCommit }), git.TREE({ ref: commit.oid })],
        map: async function (filepath: string, [A, B]: any[]) {
          // Skip directories
          if (filepath === '.') return;
          // Only process file blobs; ignore trees (directories) and other types
          try {
            const at = A ? await A.type() : undefined;
            const bt = B ? await B.type() : undefined;
            const isABlob = at === 'blob';
            const isBBlob = bt === 'blob';
            if (!isABlob && !isBBlob) {
              // Neither side is a file blob (likely a directory or submodule), skip
              return;
            }
          } catch (e) {
            // If type detection fails, be conservative and continue; subsequent reads will guard
          }

          const Aoid = await A?.oid();
          const Boid = await B?.oid();

          // Determine file status
          let status: 'added' | 'modified' | 'deleted' | 'renamed' = 'modified';
          if (Aoid === undefined && Boid !== undefined) {
            status = 'added';
          } else if (Aoid !== undefined && Boid === undefined) {
            status = 'deleted';
          } else if (Aoid !== Boid) {
            status = 'modified';
          } else {
            return; // No change
          }

          // Get diff for this file
          let diffHunks: Array<{
            oldStart: number;
            oldLines: number;
            newStart: number;
            newLines: number;
            patches: Array<{ line: string; type: '+' | '-' | ' ' }>;
          }> = [];

          try {
            if (status === 'added') {
              // For added files, show entire content as additions
              const blob = await B!.content();
              const lines = new TextDecoder().decode(blob).split('\n');
              diffHunks = [
                {
                  oldStart: 0,
                  oldLines: 0,
                  newStart: 1,
                  newLines: lines.length,
                  patches: lines.map((line) => ({ line, type: '+' as const }))
                }
              ];
            } else if (status === 'deleted') {
              // For deleted files, show entire content as deletions
              const blob = await A!.content();
              const lines = new TextDecoder().decode(blob).split('\n');
              diffHunks = [
                {
                  oldStart: 1,
                  oldLines: lines.length,
                  newStart: 0,
                  newLines: 0,
                  patches: lines.map((line) => ({ line, type: '-' as const }))
                }
              ];
            } else {
              // For modified files, compute actual diff
              const oldBlob = await A!.content();
              const newBlob = await B!.content();

              const oldText = new TextDecoder().decode(oldBlob);
              const newText = new TextDecoder().decode(newBlob);

              // Simple line-by-line diff (could be enhanced with proper diff algorithm)
              const oldLines = oldText.split('\n');
              const newLines = newText.split('\n');

              // Basic diff implementation
              const patches: Array<{ line: string; type: '+' | '-' | ' ' }> = [];
              let oldIndex = 0;
              let newIndex = 0;

              while (oldIndex < oldLines.length || newIndex < newLines.length) {
                const oldLine = oldLines[oldIndex];
                const newLine = newLines[newIndex];

                if (oldIndex >= oldLines.length) {
                  // Only new lines left
                  patches.push({ line: newLine, type: '+' });
                  newIndex++;
                } else if (newIndex >= newLines.length) {
                  // Only old lines left
                  patches.push({ line: oldLine, type: '-' });
                  oldIndex++;
                } else if (oldLine === newLine) {
                  // Lines match
                  patches.push({ line: oldLine, type: ' ' });
                  oldIndex++;
                  newIndex++;
                } else {
                  // Lines differ - simple approach: mark old as deleted, new as added
                  patches.push({ line: oldLine, type: '-' });
                  patches.push({ line: newLine, type: '+' });
                  oldIndex++;
                  newIndex++;
                }
              }

              if (patches.length > 0) {
                diffHunks = [
                  {
                    oldStart: 1,
                    oldLines: oldLines.length,
                    newStart: 1,
                    newLines: newLines.length,
                    patches
                  }
                ];
              }
            }
          } catch (diffError) {
            console.warn(`Failed to generate diff for ${filepath}:`, diffError);
            // Return empty diff hunks on error
            diffHunks = [];
          }

          return {
            path: filepath,
            status,
            diffHunks
          };
        }
      });

      // Filter out undefined results and add to changes
      changes.push(...changedFiles.filter(Boolean));
      if (changes.length === 0) {
        try {
          console.debug('[git-worker.getCommitDetails] No changes detected', {
            repoId,
            commitId,
            resolved: commit.oid
          });
        } catch {}
      }
    } else {
      // Initial commit - show all files as added
      const files = await git.walk({
        dir,
        trees: [git.TREE({ ref: commitId })],
        map: async function (filepath: string, [A]: any[]) {
          if (filepath === '.') return;

          const oid = await A?.oid();
          if (!oid) return;

          try {
            const content = await git.readBlob({ dir, oid, filepath });
            const lines = new TextDecoder().decode(content.blob).split('\n');

            return {
              path: filepath,
              status: 'added' as const,
              diffHunks: [
                {
                  oldStart: 0,
                  oldLines: 0,
                  newStart: 1,
                  newLines: lines.length,
                  patches: lines.map((line) => ({ line, type: '+' as const }))
                }
              ]
            };
          } catch (error) {
            console.warn(`Failed to read file ${filepath}:`, error);
            return {
              path: filepath,
              status: 'added' as const,
              diffHunks: []
            };
          }
        }
      });

      changes.push(...files.filter(Boolean));
    }

    return {
      success: true,
      meta,
      changes
    };
  } catch (error: any) {
    console.error(`Error getting commit details for ${commitId}:`, error);
    return {
      success: false,
      error: error.message || 'Failed to get commit details'
    };
  }
}

// Compute working tree status for a repository
async function getStatus({ repoId, branch }: { repoId: string; branch?: string }): Promise<{
  success: boolean;
  repoId: string;
  branch: string;
  files: Array<{
    path: string;
    head: number;
    workdir: number;
    stage: number;
    status:
      | 'added'
      | 'modified'
      | 'deleted'
      | 'untracked'
      | 'ignored'
      | 'conflicted'
      | 'staged'
      | 'renamed'
      | 'unknown';
  }>;
  counts: Record<string, number>;
  text?: string;
  error?: string;
}> {
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;
  try {
    // Ensure repo exists
    const cloned = await isRepoCloned(dir);
    if (!cloned) {
      return {
        success: false,
        repoId,
        branch: branch || 'main',
        files: [],
        counts: {},
        error: 'Repository not cloned locally'
      };
    }

    // Resolve branch robustly
    const targetBranch = await resolveRobustBranchInWorker(dir, branch);

    // Best-effort checkout to ensure HEAD points to target branch
    try {
      await git.checkout({ dir, ref: targetBranch });
    } catch {
      // ignore
    }

    const matrix = await git.statusMatrix({ dir });
    type StatusFile = {
      path: string;
      head: number;
      workdir: number;
      stage: number;
      status:
        | 'added'
        | 'modified'
        | 'deleted'
        | 'untracked'
        | 'ignored'
        | 'conflicted'
        | 'staged'
        | 'renamed'
        | 'unknown';
    };

    const files: StatusFile[] = matrix.map((row: any) => {
      const path = row[0] as string;
      const head = row[1] as number;
      const workdir = row[2] as number;
      const stage = row[3] as number;
      let status: StatusFile['status'] = 'unknown';
      if (head === 0 && workdir === 2 && stage === 0) status = 'untracked';
      else if (head === 1 && workdir === 0 && stage === 0) status = 'deleted';
      else if (head === 1 && workdir === 2 && stage === 1) status = 'modified';
      else if (head === 0 && workdir === 2 && stage === 2) status = 'added';
      else if (head !== stage) status = 'staged';
      return { path, head, workdir, stage, status };
    });

    const counts: Record<string, number> = {};
    for (const f of files) counts[f.status] = (counts[f.status] || 0) + 1;

    // Build a git-like summary text
    const lines: string[] = [];
    lines.push(`On branch ${targetBranch}`);
    const changed = files.filter((f) => f.status !== 'unknown' && f.status !== 'ignored');
    if (changed.length === 0) {
      lines.push('nothing to commit, working tree clean');
    } else {
      const staged = files.filter((f) => f.status === 'staged' || f.stage === 2);
      const notStaged = files.filter(
        (f) =>
          (f.status === 'modified' || f.status === 'deleted' || f.status === 'added') &&
          f.stage !== 2
      );
      const untracked = files.filter((f) => f.status === 'untracked');
      if (staged.length) {
        lines.push('Changes to be committed:');
        lines.push('  (use "git reset HEAD <file>..." to unstage)');
        for (const f of staged) lines.push(`        ${f.status}:   ${f.path}`);
      }
      if (notStaged.length) {
        lines.push('Changes not staged for commit:');
        lines.push('  (use "git add <file>..." to update what will be committed)');
        for (const f of notStaged) lines.push(`        ${f.status}:   ${f.path}`);
      }
      if (untracked.length) {
        lines.push('Untracked files:');
        lines.push('  (use "git add <file>..." to include in what will be committed)');
        for (const f of untracked) lines.push(`        ${f.path}`);
      }
    }

    return {
      success: true,
      repoId,
      branch: targetBranch,
      files,
      counts,
      text: lines.join('\n') + '\n'
    };
  } catch (error: any) {
    return {
      success: false,
      repoId,
      branch: branch || 'main',
      files: [],
      counts: {},
      error: error.message || String(error)
    };
  }
}

expose({
  cloneAndFork,
  clone,
  smartInitializeRepo,
  // Ensure syncWithRemote always returns structured-cloneable data
  syncWithRemote: async (args: any) => toPlain(await syncWithRemote(args)),
  initializeRepo,
  ensureShallowClone,
  ensureFullClone,
  getRepoDataLevel,
  clearCloneCache,
  getCommitHistory,
  getCommitCount,
  deleteRepo,
  analyzePatchMerge,
  applyPatchAndPush,
  resetRepoToRemote,
  setAuthConfig,
  createLocalRepo,
  createRemoteRepo,
  pushToRemote,
  safePushToRemote,
  cloneRemoteRepo,
  forkAndCloneRepo,
  updateRemoteRepoMetadata,
  updateAndPushFiles,
  getCommitDetails,
  getStatus,
  setEventSigner, // Flag to indicate signing is available
  requestEventSigning, // Function to request event signing from UI thread
  setRequestEventSigningHandler // Function to register the event signing handler
});
