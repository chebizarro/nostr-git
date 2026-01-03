import type { GitProvider } from '@nostr-git/git';
import { RepoCache, RepoCacheManager } from './cache.js';
import { getAuthCallback, setAuthConfig } from './auth.js';
import { resolveRobustBranch } from './branches.js';
import { getProviderFs, safeRmrf, ensureDir } from './fs-utils.js';

// Import toPlain from worker (it's defined in the same directory)
function toPlain<T>(val: T): T {
  try {
    return JSON.parse(JSON.stringify(val));
  } catch {
    return val;
  }
}

export interface CloneRemoteRepoOptions {
  url: string;
  depth?: number;
  dir: string;
  token?: string;
  onProgress?: (stage: string, pct?: number) => void;
}

/**
 * Clear in-memory tracking structures (delegated by git-worker).
 */
export function clearCloneTracking(
  clonedRepos: Set<string>,
  repoDataLevels: Map<string, 'refs' | 'shallow' | 'full'>
) {
  clonedRepos.clear();
  repoDataLevels.clear();
}

type DataLevel = 'refs' | 'shallow' | 'full';

export async function smartInitializeRepoUtil(
  git: GitProvider,
  cacheManager: RepoCacheManager,
  opts: {
    repoId: string;
    cloneUrls: string[];
    forceUpdate?: boolean;
  },
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    repoDataLevels: Map<string, DataLevel>;
    clonedRepos: Set<string>;
    isRepoCloned: (git: GitProvider, dir: string) => Promise<boolean>;
    resolveRobustBranch: (git: GitProvider, dir: string, requested?: string) => Promise<string>;
  },
  sendProgress: (phase: string, loaded?: number, total?: number) => void
) {
  const { repoId, cloneUrls, forceUpdate = false } = opts;
  const {
    rootDir,
    canonicalRepoKey,
    repoDataLevels,
    clonedRepos,
    isRepoCloned,
    resolveRobustBranch
  } = deps;

  try {
    const key = canonicalRepoKey(repoId);
    const cache = await cacheManager.getRepoCache(key);
    if (cache && !forceUpdate) {
      sendProgress('Using cached data');
      repoDataLevels.set(key, cache.dataLevel);
      clonedRepos.add(key);
      return {
        success: true,
        repoId,
        fromCache: true,
        dataLevel: cache.dataLevel,
        branches: cache.branches,
        headCommit: cache.headCommit
      };
    }

    sendProgress('Checking repository status');
    const dir = `${rootDir}/${key}`;
    const isAlreadyCloned = await isRepoCloned(git, dir);

    if (isAlreadyCloned && !forceUpdate) {
      try {
        sendProgress('Syncing with remote');
        const cloneUrl = cloneUrls[0];
        if (cloneUrl) {
          try {
            await git.fetch({
              dir,
              url: cloneUrl,
              ref: 'HEAD', // Use HEAD instead of trying to resolve branch first
              singleBranch: false,
              depth: repoDataLevels.get(key) === 'full' ? undefined : 50
            });
          } catch (fetchError: any) {
            // Handle CORS/network errors gracefully during fetch
            const errorMessage = fetchError?.message || String(fetchError);
            if (errorMessage.includes('CORS') || 
                errorMessage.includes('NetworkError') || 
                errorMessage.includes('Failed to fetch') ||
                errorMessage.includes('Access-Control')) {
              console.warn(`[smartInitializeRepo] CORS/Network error during fetch, using local data only:`, errorMessage);
              // Continue with local data, don't throw error
            } else {
              throw fetchError;
            }
          }
        }
        
        // Try to resolve branch, but handle empty repos gracefully
        let mainBranch: string;
        try {
          mainBranch = await resolveRobustBranch(git, dir);
        } catch (branchError) {
          console.warn(`[smartInitializeRepo] Could not resolve branches, repository may be empty:`, branchError);
          // For empty repos, we'll return a limited success state
          return toPlain({
            success: true,
            repoId,
            fromCache: false,
            dataLevel: 'refs',
            warning: 'Repository initialized but no branches found. Repository may be empty.',
            serializable: true
          });
        }
        const remoteRef = `refs/remotes/origin/${mainBranch}`;
        let remoteCommit: string;
        try {
          remoteCommit = await git.resolveRef({ dir, ref: remoteRef });
          await git.writeRef({ dir, ref: `refs/heads/${mainBranch}`, value: remoteCommit });
          await git.writeRef({
            dir,
            ref: 'HEAD',
            value: `ref: refs/heads/${mainBranch}`,
            symbolic: true
          });
          sendProgress('Local repository synced with remote');
        } catch (e) {
          remoteCommit = await git.resolveRef({ dir, ref: 'HEAD' });
        }
        const branches = await git.listBranches({ dir });
        const newCache: RepoCache = {
          repoId: key,
          lastUpdated: Date.now(),
          headCommit: remoteCommit,
          dataLevel: (repoDataLevels.get(key) || 'shallow') as DataLevel,
          branches: branches.map((name: string) => ({ name, commit: remoteCommit })),
          cloneUrls
        };
        await cacheManager.setRepoCache(newCache);
        repoDataLevels.set(key, newCache.dataLevel);
        clonedRepos.add(key);
        sendProgress('Repository ready');
        return {
          success: true,
          repoId,
          fromCache: false,
          dataLevel: newCache.dataLevel,
          branches: newCache.branches,
          headCommit: newCache.headCommit,
          synced: true
        };
      } catch (e) {
        // fall through to re-init
      }
    }

    return await initializeRepoUtil(
      git,
      cacheManager,
      { repoId, cloneUrls },
      { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos },
      sendProgress
    );
  } catch (error: any) {
    return {
      success: false,
      repoId: opts.repoId,
      error: error?.message || String(error),
      fromCache: false
    };
  }
}

export async function initializeRepoUtil(
  git: GitProvider,
  cacheManager: RepoCacheManager,
  opts: { repoId: string; cloneUrls: string[] },
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    repoDataLevels: Map<string, DataLevel>;
    clonedRepos: Set<string>;
  },
  sendProgress: (phase: string, loaded?: number, total?: number) => void
) {
  const { repoId, cloneUrls } = opts;
  const { rootDir, canonicalRepoKey, repoDataLevels, clonedRepos } = deps;
  try {
    const key = canonicalRepoKey(repoId);
    const dir = `${rootDir}/${key}`;
    sendProgress('Initializing repository');

    let lastError: Error | null = null;
    let succeeded = false;
    let corsError = false;
    
    for (const cloneUrl of cloneUrls) {
      sendProgress('Fetching repository metadata', 0, 1);
      const onProgress = (progress: { phase: string; loaded?: number; total?: number }) =>
        sendProgress(progress.phase, progress.loaded, progress.total);
      const authCallback = getAuthCallback(cloneUrl);
      const refCandidates = ['HEAD', 'main', 'master', 'develop', 'dev'];
      
      for (const refCandidate of refCandidates) {
        try {
          await git.clone({
            dir,
            url: cloneUrl,
            ref: refCandidate,
            singleBranch: true,
            depth: 1,
            noCheckout: true,
            noTags: true,
            onProgress,
            ...(authCallback && { onAuth: authCallback })
          });
          succeeded = true;
          break;
        } catch (e: any) {
          lastError = e;
          const errorMessage = e?.message || String(e);
          
          // Check for CORS/network errors specifically
          if (errorMessage.includes('CORS') || 
              errorMessage.includes('NetworkError') || 
              errorMessage.includes('Failed to fetch') ||
              errorMessage.includes('Access-Control') ||
              errorMessage.includes('Cross-Origin')) {
            corsError = true;
            console.warn(`[initializeRepo] CORS/Network error for ${cloneUrl}:`, errorMessage);
          }
          
          continue;
        }
      }
      if (succeeded) break;
    }
    
    if (!succeeded) {
      if (corsError) {
        // For CORS errors, return a special response instead of throwing
        return toPlain({
          success: false,
          repoId,
          error: 'Repository initialization failed due to CORS/network restrictions. The remote repository may be accessible but the browser cannot fetch it due to security policies.',
          corsError: true,
          fromCache: false,
          serializable: true
        });
      }
      throw lastError || new Error('All clone URLs failed');
    }

    const branches = await git.listBranches({ dir });
    const headCommit = await git.resolveRef({ dir, ref: 'HEAD' });
    repoDataLevels.set(key, 'refs');
    clonedRepos.add(key);
    const cache: RepoCache = {
      repoId: key,
      lastUpdated: Date.now(),
      headCommit,
      dataLevel: 'refs',
      branches: branches.map((name: string) => ({ name, commit: headCommit })),
      cloneUrls
    };
    await cacheManager.setRepoCache(cache);
    sendProgress('Repository initialized');
    return {
      success: true,
      repoId,
      dataLevel: 'refs' as const,
      branches: cache.branches,
      headCommit,
      fromCache: false
    };
  } catch (error: any) {
    return { success: false, repoId, error: error?.message || String(error), fromCache: false };
  }
}

export async function ensureShallowCloneUtil(
  git: GitProvider,
  opts: { repoId: string; branch?: string },
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    repoDataLevels: Map<string, DataLevel>;
    clonedRepos: Set<string>;
    isRepoCloned: (git: GitProvider, dir: string) => Promise<boolean>;
    resolveRobustBranch: (git: GitProvider, dir: string, requested?: string) => Promise<string>;
  },
  sendProgress: (phase: string, loaded?: number, total?: number) => void
) {
  const { repoId, branch } = opts;
  const {
    rootDir,
    canonicalRepoKey,
    repoDataLevels,
    clonedRepos,
    isRepoCloned,
    resolveRobustBranch
  } = deps;
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;
  let targetBranch: string = branch || 'main';
  try {
    targetBranch = await resolveRobustBranch(git, dir, branch);
    const currentLevel = repoDataLevels.get(key);
    if (currentLevel === 'shallow' || currentLevel === 'full') {
      sendProgress('Using existing shallow clone');
      return { success: true, repoId, branch, dataLevel: currentLevel, fromCache: true };
    }
    if (!clonedRepos.has(key)) {
      if (!(await isRepoCloned(git, dir))) {
        return {
          success: false,
          repoId,
          error: 'Repository not initialized. Call initializeRepo first.'
        };
      }
    }
    sendProgress('Fetching branch content', 0, 1);
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');
    if (!originRemote?.url) throw new Error('Origin remote not found or has no URL configured');
    const authCallback = getAuthCallback(originRemote.url);
    await git.fetch({
      dir,
      url: originRemote.url,
      ref: targetBranch,
      depth: 1,
      singleBranch: true,
      onProgress: (p: any) => sendProgress(p.phase, p.loaded, p.total),
      ...(authCallback && { onAuth: authCallback })
    });
    await git.checkout({ dir, ref: targetBranch });
    repoDataLevels.set(key, 'shallow');
    return {
      success: true,
      repoId,
      branch: targetBranch,
      dataLevel: 'shallow' as const,
      fromCache: false
    };
  } catch (error: any) {
    return { success: false, repoId, branch: targetBranch, error: error?.message || String(error) };
  }
}

export async function ensureFullCloneUtil(
  git: GitProvider,
  opts: { repoId: string; branch?: string; depth?: number },
  deps: {
    rootDir: string;
    canonicalRepoKey: (id: string) => string;
    repoDataLevels: Map<string, DataLevel>;
    clonedRepos: Set<string>;
    isRepoCloned: (git: GitProvider, dir: string) => Promise<boolean>;
    resolveRobustBranch: (git: GitProvider, dir: string, requested?: string) => Promise<string>;
  },
  sendProgress: (phase: string, loaded?: number, total?: number) => void
) {
  const { repoId, branch, depth = 50 } = opts;
  const {
    rootDir,
    canonicalRepoKey,
    repoDataLevels,
    clonedRepos,
    isRepoCloned,
    resolveRobustBranch
  } = deps;
  const key = canonicalRepoKey(repoId);
  const dir = `${rootDir}/${key}`;
  const targetBranch = await resolveRobustBranch(git, dir, branch);
  const currentLevel = repoDataLevels.get(key);
  if (currentLevel === 'full') return { success: true, repoId, cached: true, level: currentLevel };
  if (!clonedRepos.has(key)) {
    if (!(await isRepoCloned(git, dir)))
      return {
        success: false,
        repoId,
        error: 'Repository not initialized. Call initializeRepo first.'
      };
  }
  sendProgress(`Fetching commit history (depth: ${depth})...`);
  try {
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');
    if (!originRemote?.url) throw new Error('Origin remote not found or has no URL configured');
    const authCallback = getAuthCallback(originRemote.url);
    await git.fetch({
      dir,
      url: originRemote.url,
      ref: targetBranch,
      depth: Math.min(depth, 100),
      singleBranch: true,
      tags: false,
      onProgress: (p: any) => sendProgress(`Full clone: ${p.phase}`, p.loaded, p.total),
      ...(authCallback && { onAuth: authCallback })
    });
    repoDataLevels.set(key, 'full');
    return { success: true, repoId, cached: false, level: 'full' as const };
  } catch (error: any) {
    return { success: false, repoId, error: error?.message || String(error) };
  }
}

/**
 * Extracted clone implementation. Accepts dependencies to avoid tight coupling.
 * Behavior mirrors the previous in-file implementation.
 */
export async function cloneRemoteRepoUtil(
  git: GitProvider,
  cacheManager: RepoCacheManager,
  options: CloneRemoteRepoOptions
): Promise<void> {
  const { url, depth, dir, token, onProgress } = options;

  try {
    onProgress?.('Validating repository URL...', 0);

    let repoUrl: URL;
    try {
      repoUrl = new URL(url);
    } catch {
      throw new Error(`Invalid repository URL: ${url}`);
    }

    // Ensure the parent directory exists before cloning
    // isomorphic-git requires the parent directory to exist
    try {
      const fs = getProviderFs(git);
      if (fs?.promises) {
        // Get parent directory (everything except the last component)
        const pathParts = dir.split('/').filter(Boolean);
        if (pathParts.length > 1) {
          const parentDir = '/' + pathParts.slice(0, -1).join('/');
          await ensureDir(fs, parentDir);
        } else {
          // If dir is at root level, ensure root exists
          await ensureDir(fs, '/');
        }
      }
    } catch (dirError) {
      // Log but don't fail - some FS implementations handle this automatically
      console.warn('[cloneRemoteRepoUtil] Could not ensure parent directory exists:', dirError);
    }

    if (token) {
      const hostname = repoUrl.hostname;
      setAuthConfig({ tokens: [{ host: hostname, token }] });
    }

    onProgress?.('Discovering remote references...', 10);

    const refs = await git.listServerRefs({
      url,
      onAuth: getAuthCallback(url)
    });

    if (!refs || refs.length === 0) {
      throw new Error('Repository not found or no refs available');
    }

    onProgress?.('Cloning repository...', 20);

    const cloneOptions: any = {
      dir,
      url,
      onAuth: getAuthCallback(url),
      singleBranch: false,
      noCheckout: false,
      onProgress: (progress: any) => {
        if (progress.phase === 'Receiving objects') {
          const pct = 20 + (progress.loaded / progress.total) * 60;
          onProgress?.(`Downloading objects (${progress.loaded}/${progress.total})...`, pct);
        } else if (progress.phase === 'Resolving deltas') {
          const pct = 80 + (progress.loaded / progress.total) * 15;
          onProgress?.(`Resolving deltas (${progress.loaded}/${progress.total})...`, pct);
        }
      }
    };
    if (depth && depth > 0) cloneOptions.depth = depth;

    await git.clone(cloneOptions);

    onProgress?.('Setting up local branches...', 95);

    const defaultBranch = await resolveRobustBranch(git, dir);
    await git.checkout({ dir, ref: defaultBranch });

    const headCommit = await git.resolveRef({ dir, ref: 'HEAD' });
    const branches = await git.listBranches({ dir });

    const cache: RepoCache = {
      repoId: dir,
      lastUpdated: Date.now(),
      headCommit,
      dataLevel: depth ? 'shallow' : 'full',
      branches: branches.map((name: string) => ({ name, commit: '' })),
      cloneUrls: [url]
    };

    await cacheManager.init();
    await cacheManager.setRepoCache(cache);

    onProgress?.('Clone completed successfully!', 100);
  } catch (error) {
    // Clean up on failure using provider fs, but ignore errors
    try {
      const fs: any = getProviderFs(git);
      await safeRmrf(fs, dir);
    } catch {}

    throw new Error(`Clone failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
