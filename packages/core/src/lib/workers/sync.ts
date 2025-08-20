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
      const refs = await git.listServerRefs({ url: cloneUrl, prefix: 'refs/heads/', symrefs: true });
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
    const mainBranch = refs.find((r: any) => r.ref === 'refs/heads/main' || r.ref === 'refs/heads/master');
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

  try {
    const cloned = await isRepoCloned(dir);
    if (!cloned) throw new Error('Repository not cloned locally. Clone first before syncing.');

    const targetBranch = await resolveRobustBranch(dir, branch);

    // Determine remote URL for fetch
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');
    const remoteUrl = originRemote?.url || cloneUrls[0];

    const onAuth = remoteUrl ? undefined : undefined; // Auth handled inside git-worker using callbacks where needed

    // Fetch and update tracking ref
    await git.fetch({ dir, url: remoteUrl, ref: targetBranch, singleBranch: true, depth: 1, prune: true, onAuth });

    // Resolve remote HEAD
    const remoteCommit = await git.resolveRef({ dir, ref: `refs/remotes/origin/${targetBranch}` }).catch(async () => {
      // Fallback to HEAD if tracking ref not available
      return await git.resolveRef({ dir, ref: 'HEAD' });
    });

    // Update cache
    const branches = await git.listBranches({ dir });
    const newCache = {
      repoId: key,
      lastUpdated: Date.now(),
      headCommit: remoteCommit,
      dataLevel: 'shallow' as const,
      branches: branches.map((name: string) => ({ name, commit: remoteCommit })),
      cloneUrls,
    };

    await cacheManager.setRepoCache(newCache);

    return toPlain({ success: true, repoId, branch: targetBranch, headCommit: remoteCommit, synced: true, serializable: true });
  } catch (error: any) {
    return toPlain({ success: false, repoId, error: error?.message || String(error) });
  }
}
