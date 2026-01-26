import type { GitProvider } from '../../git/provider.js';
import type { RepoCache, RepoCacheManager } from './cache.js';
import { resolveBranchToOid } from '../../git/git.js';
import {
  withUrlFallback,
  filterValidCloneUrls,
  reorderUrlsByPreference,
} from '../../utils/clone-url-fallback.js';

export async function needsUpdateUtil(
  git: GitProvider,
  repoId: string,
  cloneUrls: string[],
  cache: RepoCache | null,
  now: number = Date.now(),
  onAuth?: (url: string, auth: { username?: string; password?: string }) => { username: string; password: string } | Promise<{ username: string; password: string }> | void
): Promise<boolean> {
  // Filter and order URLs by preference
  const validUrls = filterValidCloneUrls(cloneUrls);
  const orderedUrls = reorderUrlsByPreference(validUrls, repoId);

  if (orderedUrls.length === 0) {
    return cache ? now - cache.lastUpdated > 60 * 60 * 1000 : false;
  }

  // Debug logging intentionally omitted in util to keep test output clean
  if (!cache) {
    // Try each URL with fallback until one succeeds
    const result = await withUrlFallback(
      orderedUrls,
      async (cloneUrl: string) => {
        const refs = await git.listServerRefs({
          url: cloneUrl,
          prefix: 'refs/heads/',
          symrefs: true,
          onAuth
        });
        // If there are no branch heads yet, treat as empty remote and allow initial push
        const heads = (refs || []).filter((r: any) => r?.ref?.startsWith('refs/heads/'));
        return { hasHeads: heads && heads.length > 0 };
      },
      { repoId }
    );

    if (result.success && result.result) {
      return result.result.hasHeads;
    }

    // All URLs failed (e.g., CORS) - be permissive for initial push
    return false;
  }

  const maxCacheAge = 60 * 60 * 1000; // 1 hour
  if (now - cache.lastUpdated > maxCacheAge) return true;

  // Try each URL with fallback to check if update is needed
  const result = await withUrlFallback(
    orderedUrls,
    async (cloneUrl: string) => {
      const refs = await git.listServerRefs({ url: cloneUrl, prefix: 'refs/heads/', symrefs: true, onAuth });
      const mainBranch = refs.find(
        (r: any) => r.ref === 'refs/heads/main' || r.ref === 'refs/heads/master'
      );
      if (!mainBranch) {
        return { needsUpdate: refs && refs.length > 0 };
      }
      return { needsUpdate: mainBranch.oid !== cache.headCommit };
    },
    { repoId }
  );

  if (result.success && result.result) {
    return result.result.needsUpdate;
  }

  // All URLs failed - fall back to cache age check
  return now - cache.lastUpdated > maxCacheAge;
}

export async function syncWithRemoteUtil(
  git: GitProvider,
  cacheManager: RepoCacheManager,
  opts: { repoId: string; cloneUrls: string[]; branch?: string },
  deps: {
    rootDir: string;
    parseRepoId: (id: string) => string;
    resolveBranchName: (dir: string, requested?: string) => Promise<string>;
    isRepoCloned: (dir: string) => Promise<boolean>;
    toPlain: <T>(v: T) => T;
  }
) {
  const { repoId, cloneUrls, branch } = opts;
  const { rootDir, parseRepoId, resolveBranchName, isRepoCloned, toPlain } = deps;
  const key = parseRepoId(repoId);
  const dir = `${rootDir}/${key}`;

  const startTime = Date.now();
  console.log(`[syncWithRemote] Starting sync for ${repoId}, branch: ${branch || 'default'}`);

  try {
    // 1. Verify repo exists locally
    const cloned = await isRepoCloned(dir);
    if (!cloned) {
      const error = 'Repository not cloned locally. Clone first before syncing.';
      console.error(`[syncWithRemote] ${error}`);
      throw new Error(error);
    }

    // 2. Get remote URLs - prefer configured origin, then fall back to cloneUrls
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');

    // Build list of URLs to try: origin URL first (if available), then cloneUrls
    const urlsToTry: string[] = [];
    if (originRemote?.url) {
      urlsToTry.push(originRemote.url);
    }
    // Add cloneUrls that aren't already in the list
    const validCloneUrls = filterValidCloneUrls(cloneUrls);
    for (const url of validCloneUrls) {
      if (!urlsToTry.includes(url)) {
        urlsToTry.push(url);
      }
    }

    // Reorder by preference (cached successful URL first)
    const orderedUrls = reorderUrlsByPreference(urlsToTry, key);

    if (orderedUrls.length === 0) {
      throw new Error('No remote URL available for sync');
    }
    console.log(`[syncWithRemote] URLs to try: ${orderedUrls.join(', ')}`);

    // 3. Try to fetch the requested branch from remote with URL fallback
    let targetBranch = branch;
    let fetchSuccess = false;
    let usedUrl: string | undefined;

    if (targetBranch) {
      console.log(`[syncWithRemote] Attempting to fetch requested branch: ${targetBranch}`);

      const fetchResult = await withUrlFallback(
        orderedUrls,
        async (remoteUrl: string) => {
          await git.fetch({
            dir,
            url: remoteUrl,
            ref: targetBranch as string,
            singleBranch: true,
            depth: 1,
            prune: true
          });
          return { url: remoteUrl };
        },
        { repoId: key, perUrlTimeoutMs: 15000 }
      );

      if (fetchResult.success) {
        console.log(`[syncWithRemote] Successfully fetched requested branch from ${fetchResult.usedUrl}`);
        fetchSuccess = true;
        usedUrl = fetchResult.usedUrl;

        if (fetchResult.attempts.length > 1) {
          console.log(`[syncWithRemote] Fetch succeeded after ${fetchResult.attempts.filter(a => !a.success).length} failed attempt(s)`);
        }
      } else {
        // Check if all errors were CORS/network related
        const allCorsErrors = fetchResult.attempts.every(a => {
          const msg = a.error || '';
          return msg.includes('CORS') || msg.includes('NetworkError') ||
                 msg.includes('Failed to fetch') || msg.includes('Access-Control');
        });

        if (allCorsErrors) {
          console.warn(`[syncWithRemote] All ${fetchResult.attempts.length} URLs failed with CORS/Network errors, using local data only`);
          return toPlain({
            success: true,
            repoId,
            branch: targetBranch,
            headCommit: null,
            localCommit: null,
            needsUpdate: false,
            synced: false,
            duration: Date.now() - startTime,
            warning: `Could not fetch from any remote (${fetchResult.attempts.length} tried) due to CORS/network restrictions. Using local data only.`,
            serializable: true
          });
        }

        // If fetch failed for other reasons (branch not found on remote), fall back to robust resolution
        console.warn(`[syncWithRemote] Failed to fetch requested branch '${targetBranch}' from all ${fetchResult.attempts.length} URLs`);
      }
    }

    // 4. If requested branch fetch failed or no branch specified, use robust branch resolution
    if (!fetchSuccess) {
      targetBranch = await resolveBranchName(dir, branch);
      console.log(`[syncWithRemote] Resolved fallback branch: ${targetBranch}`);

      console.log(`[syncWithRemote] Fetching fallback branch from remote with URL fallback...`);

      const fetchResult = await withUrlFallback(
        orderedUrls,
        async (remoteUrl: string) => {
          await git.fetch({
            dir,
            url: remoteUrl,
            ref: targetBranch as string,
            singleBranch: true,
            depth: 1,
            prune: true
          });
          return { url: remoteUrl };
        },
        { repoId: key, perUrlTimeoutMs: 15000 }
      );

      if (fetchResult.success) {
        console.log(`[syncWithRemote] Fetch completed for fallback branch from ${fetchResult.usedUrl}`);
        usedUrl = fetchResult.usedUrl;
      } else {
        // Check if all errors were CORS/network related
        const allCorsErrors = fetchResult.attempts.every(a => {
          const msg = a.error || '';
          return msg.includes('CORS') || msg.includes('NetworkError') ||
                 msg.includes('Failed to fetch') || msg.includes('Access-Control');
        });

        if (allCorsErrors) {
          console.warn(`[syncWithRemote] All ${fetchResult.attempts.length} URLs failed with CORS/Network errors for fallback branch`);
          return toPlain({
            success: true,
            repoId,
            branch: targetBranch,
            headCommit: null,
            localCommit: null,
            needsUpdate: false,
            synced: false,
            duration: Date.now() - startTime,
            warning: `Could not fetch from any remote (${fetchResult.attempts.length} tried) due to CORS/network restrictions. Using local data only.`,
            serializable: true
          });
        }

        // Throw the last error
        const lastAttempt = fetchResult.attempts[fetchResult.attempts.length - 1];
        throw new Error(lastAttempt?.error || 'All fetch attempts failed');
      }
    }

    // 5. Ensure the branch is checked out locally so it's available for file operations
    try {
      // Check if local branch exists
      const localBranches = await git.listBranches({ dir });
      if (!localBranches.includes(targetBranch)) {
        // Create local branch from remote tracking branch
        console.log(`[syncWithRemote] Creating local branch '${targetBranch}' from remote`);
        try {
          const remoteRef = `refs/remotes/origin/${targetBranch}`;
          const remoteCommit = await git.resolveRef({ dir, ref: remoteRef });
          await git.branch({ dir, ref: targetBranch, checkout: false, object: remoteCommit });
          console.log(`[syncWithRemote] Local branch '${targetBranch}' created`);
        } catch (branchError) {
          console.warn(`[syncWithRemote] Could not create local branch:`, branchError);
        }
      }
      
      // Checkout the branch
      console.log(`[syncWithRemote] Checking out branch: ${targetBranch}`);
      await git.checkout({ dir, ref: targetBranch });
      console.log(`[syncWithRemote] Branch checked out successfully`);
    } catch (checkoutError) {
      console.warn(`[syncWithRemote] Checkout warning (continuing anyway):`, checkoutError);
      // Don't fail the entire sync if checkout has issues
    }

    // 6. Resolve remote HEAD
    const remoteCommit = await git
      .resolveRef({ dir, ref: `refs/remotes/origin/${targetBranch}` })
      .catch(async () => {
        console.warn(`[syncWithRemote] Tracking ref not found, falling back to HEAD`);
        return await git.resolveRef({ dir, ref: 'HEAD' });
      });
    console.log(`[syncWithRemote] Remote HEAD: ${remoteCommit}`);

    // 7. Get local HEAD for comparison
    const localCommit = await git.resolveRef({ dir, ref: 'HEAD' }).catch(() => null);
    const needsUpdate = localCommit !== remoteCommit;
    console.log(`[syncWithRemote] Local HEAD: ${localCommit}, needs update: ${needsUpdate}`);

    // 8. Update cache with comprehensive data
    const branchNames = await git.listBranches({ dir });
    const branchEntries: Array<{ name: string; commit: string }> = [];
    for (const name of branchNames) {
      try {
        const commit = await git
          .resolveRef({ dir, ref: `refs/heads/${name}` })
          .catch(async () => await git.resolveRef({ dir, ref: `refs/remotes/origin/${name}` }));
        branchEntries.push({ name, commit });
      } catch {
        // Skip branches we cannot resolve
      }
    }

    // Preserve existing dataLevel if present, otherwise set to 'shallow'
    const existing = await cacheManager.getRepoCache(key).catch(() => null);
    const dataLevel = (existing?.dataLevel || 'shallow') as 'refs' | 'shallow' | 'full';

    const newCache = {
      repoId: key,
      lastUpdated: Date.now(),
      headCommit: remoteCommit,
      dataLevel,
      branches: branchEntries,
      cloneUrls
    };

    await cacheManager.setRepoCache(newCache);
    console.log(`[syncWithRemote] Cache updated`);

    const duration = Date.now() - startTime;
    console.log(`[syncWithRemote] Sync completed successfully in ${duration}ms`);

    return toPlain({
      success: true,
      repoId,
      branch: targetBranch,
      headCommit: remoteCommit,
      localCommit,
      needsUpdate,
      synced: true,
      duration,
      serializable: true
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[syncWithRemote] Sync failed after ${duration}ms:`, error);
    console.error(`[syncWithRemote] Error details:`, {
      message: error?.message,
      stack: error?.stack,
      repoId,
      branch
    });
    
    return toPlain({ 
      success: false, 
      repoId, 
      branch,
      error: error?.message || String(error),
      duration
    });
  }
}
