import type { GitProvider } from '@nostr-git/git-wrapper';
import type { RepoCache, RepoCacheManager } from './cache.js';

export async function needsUpdateUtil(
  git: GitProvider,
  repoId: string,
  cloneUrls: string[],
  cache: RepoCache | null,
  now: number = Date.now()
): Promise<boolean> {
  // Debug logging intentionally omitted in util to keep test output clean
  if (!cache) {
    try {
      const cloneUrl = cloneUrls[0];
      if (!cloneUrl) return false;
      const refs = await git.listServerRefs({
        url: cloneUrl,
        prefix: 'refs/heads/',
        symrefs: true
      });
      // If there are no branch heads yet, treat as empty remote and allow initial push
      const heads = (refs || []).filter((r: any) => r?.ref?.startsWith('refs/heads/'));
      if (!heads || heads.length === 0) return false;
      return true; // has heads -> require sync
    } catch {
      // Probe may fail in browsers due to CORS (e.g., GitHub smart HTTP endpoints).
      // For initial push (no cache), be permissive and allow the push attempt.
      // If the remote truly has commits, the push will fail and we can sync then.
      return false;
    }
  }

  const maxCacheAge = 60 * 60 * 1000; // 1 hour
  if (now - cache.lastUpdated > maxCacheAge) return true;

  try {
    const cloneUrl = cloneUrls[0];
    if (!cloneUrl) return true;
    const refs = await git.listServerRefs({ url: cloneUrl, prefix: 'refs/heads/', symrefs: true });
    const mainBranch = refs.find(
      (r: any) => r.ref === 'refs/heads/main' || r.ref === 'refs/heads/master'
    );
    if (!mainBranch) return refs && refs.length === 0 ? false : true;
    return mainBranch.oid !== cache.headCommit;
  } catch {
    return now - cache.lastUpdated > maxCacheAge;
  }
}

export async function syncWithRemoteUtil(
  git: GitProvider,
  cacheManager: RepoCacheManager,
  opts: { repoId: string; cloneUrls: string[]; branch?: string },
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    resolveRobustBranch: (dir: string, requested?: string) => Promise<string>;
    isRepoCloned: (dir: string) => Promise<boolean>;
    toPlain: <T>(v: T) => T;
  }
) {
  const { repoId, cloneUrls, branch } = opts;
  const { rootDir, canonicalRepoKey, resolveRobustBranch, isRepoCloned, toPlain } = deps;
  const key = canonicalRepoKey(repoId);
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

    // 2. Resolve target branch
    const targetBranch = await resolveRobustBranch(dir, branch);
    console.log(`[syncWithRemote] Resolved branch: ${targetBranch}`);

    // 3. Get remote URL
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');
    const remoteUrl = originRemote?.url || cloneUrls[0];
    
    if (!remoteUrl) {
      throw new Error('No remote URL available for sync');
    }
    console.log(`[syncWithRemote] Using remote URL: ${remoteUrl}`);

    // 4. Fetch from remote
    console.log(`[syncWithRemote] Fetching from remote...`);
    try {
      await git.fetch({
        dir,
        url: remoteUrl,
        ref: targetBranch,
        singleBranch: true,
        depth: 1,
        prune: true
      });
      console.log(`[syncWithRemote] Fetch completed`);
    } catch (fetchError: any) {
      // Handle CORS and network errors gracefully
      const errorMessage = fetchError?.message || String(fetchError);
      if (errorMessage.includes('CORS') || 
          errorMessage.includes('NetworkError') || 
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('Access-Control')) {
        console.warn(`[syncWithRemote] CORS/Network error during fetch (this is expected for some remotes):`, errorMessage);
        // For CORS errors, we'll continue with what we have locally
        // This allows the app to work with local data even when remote is inaccessible
        return toPlain({
          success: true,
          repoId,
          branch: targetBranch,
          headCommit: null, // We couldn't get remote HEAD
          localCommit: null,
          needsUpdate: false, // Assume no update since we can't check
          synced: false, // Not fully synced due to network issues
          duration: Date.now() - startTime,
          warning: `Could not fetch from remote due to CORS/network restrictions. Using local data only.`,
          serializable: true
        });
      }
      throw fetchError;
    }

    // 5. Resolve remote HEAD
    const remoteCommit = await git
      .resolveRef({ dir, ref: `refs/remotes/origin/${targetBranch}` })
      .catch(async () => {
        console.warn(`[syncWithRemote] Tracking ref not found, falling back to HEAD`);
        return await git.resolveRef({ dir, ref: 'HEAD' });
      });
    console.log(`[syncWithRemote] Remote HEAD: ${remoteCommit}`);

    // 6. Get local HEAD for comparison
    const localCommit = await git.resolveRef({ dir, ref: 'HEAD' }).catch(() => null);
    const needsUpdate = localCommit !== remoteCommit;
    console.log(`[syncWithRemote] Local HEAD: ${localCommit}, needs update: ${needsUpdate}`);

    // 7. Update cache with comprehensive data
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
