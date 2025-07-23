import { expose } from 'comlink';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import axios from 'axios';
import { finalizeEvent, SimplePool } from 'nostr-tools';
import { GitProvider, IsomorphicGitProvider } from '@nostr-git/git-wrapper';
import { ensureRepoFromEvent, rootDir, getDefaultBranch } from '../git.js';
import { Buffer } from 'buffer';
import { analyzePatchMergeability, type MergeAnalysisResult } from '../merge-analysis.js';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

const git: GitProvider = new IsomorphicGitProvider({
  fs: new LightningFS('nostr-git'),
  http: http,
  corsProxy: 'https://cors.isomorphic-git.org',
});

/**
 * Resolve branch name with multi-fallback strategy
 * Tries the provided branch first, then common defaults in order
 */
async function resolveRobustBranchInWorker(dir: string, requestedBranch?: string): Promise<string> {
  const branchesToTry = [
    requestedBranch,
    'main',
    'master', 
    'develop',
    'dev'
  ].filter(Boolean) as string[];
  
  for (const branchName of branchesToTry) {
    try {
      await git.resolveRef({ dir, ref: branchName });
      console.log(`Successfully resolved branch '${branchName}' in worker`);
      return branchName;
    } catch (error) {
      console.log(`Failed to resolve branch '${branchName}' in worker:`, error instanceof Error ? error.message : String(error));
      continue;
    }
  }
  
  // If all fails, return 'main' as ultimate fallback
  console.warn('All branch resolution attempts failed, using main as ultimate fallback');
  return 'main';
}

// In-memory tracking (for current session)
const clonedRepos = new Set<string>();
const repoDataLevels = new Map<string, 'refs' | 'shallow' | 'full'>();

// Persistent cache interface using IndexedDB
interface RepoCache {
  repoId: string;
  lastUpdated: number;
  headCommit: string;
  dataLevel: 'refs' | 'shallow' | 'full';
  branches: Array<{ name: string; commit: string }>;
  cloneUrls: string[];
  commitCount?: number;
}

class RepoCacheManager {
  private dbName = 'nostr-git-cache';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('repos')) {
          const store = db.createObjectStore('repos', { keyPath: 'repoId' });
          store.createIndex('lastUpdated', 'lastUpdated');
        }
      };
    });
  }

  async getRepoCache(repoId: string): Promise<RepoCache | null> {
    await this.init();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readonly');
      const store = transaction.objectStore('repos');
      const request = store.get(repoId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async setRepoCache(cache: RepoCache): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      const request = store.put(cache);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteRepoCache(repoId: string): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      const request = store.delete(repoId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearOldCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    await this.init();
    if (!this.db) return;

    const cutoffTime = Date.now() - maxAgeMs;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      const index = store.index('lastUpdated');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}

const cacheManager = new RepoCacheManager();

// Initialize cache cleanup on worker start
cacheManager.clearOldCache().catch(console.warn);

/**
 * Check if repository needs updating by comparing remote HEAD with cached HEAD
 */
async function needsUpdate(repoId: string, cloneUrls: string[], cache: RepoCache | null): Promise<boolean> {
  if (!cache) return true;
  
  // Check if cache is too old (older than 1 hour)
  const maxCacheAge = 60 * 60 * 1000; // 1 hour
  if (Date.now() - cache.lastUpdated > maxCacheAge) {
    return true;
  }

  try {
    // Check remote HEAD for the main branch
    const cloneUrl = cloneUrls[0];
    if (!cloneUrl) return true;

    const refs = await git.listServerRefs({
      http: http,
      url: cloneUrl,
      prefix: 'refs/heads/',
      symrefs: true,
    });

    const mainBranch = refs.find((ref: any) => 
      ref.ref === 'refs/heads/main' || ref.ref === 'refs/heads/master'
    );

    if (!mainBranch) return true;

    // Compare with cached HEAD commit
    return mainBranch.oid !== cache.headCommit;
  } catch (error) {
    console.warn(`Failed to check remote HEAD for ${repoId}:`, error);
    // If we can't check remote, assume we need update if cache is old
    return Date.now() - cache.lastUpdated > maxCacheAge;
  }
}

/**
 * Smart repository initialization that checks cache and only updates when necessary
 */
async function smartInitializeRepo({
  repoId,
  cloneUrls,
  forceUpdate = false,
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

  try {
    // Check cache first
    const cache = await cacheManager.getRepoCache(repoId);
    const needsUpdateCheck = forceUpdate || await needsUpdate(repoId, cloneUrls, cache);
    
    if (cache && !needsUpdateCheck) {
      // Use cached data
      sendProgress('Using cached data');
      repoDataLevels.set(repoId, cache.dataLevel);
      clonedRepos.add(repoId);
      
      return {
        success: true,
        repoId,
        fromCache: true,
        dataLevel: cache.dataLevel,
        branches: cache.branches,
        headCommit: cache.headCommit,
      };
    }

    // Need to fetch from remote
    sendProgress('Checking repository status');
    
    const dir = `${rootDir}/${repoId}`;
    const isAlreadyCloned = await isRepoCloned(dir);
    
    if (isAlreadyCloned && !forceUpdate) {
      // Repository exists locally, just update cache
      try {
        const headCommit = await git.resolveRef({ dir, ref: 'HEAD' });
        const branches = await git.listBranches({ dir });
        
        const newCache: RepoCache = {
          repoId,
          lastUpdated: Date.now(),
          headCommit,
          dataLevel: repoDataLevels.get(repoId) || 'shallow',
          branches: branches.map((name: string) => ({ name, commit: headCommit })),
          cloneUrls,
        };
        
        await cacheManager.setRepoCache(newCache);
        repoDataLevels.set(repoId, newCache.dataLevel);
        clonedRepos.add(repoId);
        
        sendProgress('Repository ready');
        return {
          success: true,
          repoId,
          fromCache: false,
          dataLevel: newCache.dataLevel,
          branches: newCache.branches,
          headCommit: newCache.headCommit,
        };
      } catch (error) {
        console.warn(`Failed to read existing repo ${repoId}, re-cloning:`, error);
      }
    }

    // Perform fresh clone/initialization
    return await initializeRepo({ repoId, cloneUrls });
  } catch (error) {
    console.error(`Smart initialization failed for ${repoId}:`, error);
    return {
      success: false,
      repoId,
      error: error instanceof Error ? error.message : String(error),
      fromCache: false,
    };
  }
}

/**
 * Initialize a repository with minimal data - just refs and basic metadata
 * This is the fastest initial load, only fetching what's needed for branch listing
 */
const initializeRepo = async ({
  repoId,
  cloneUrls,
}: {
  repoId: string;
  cloneUrls: string[];
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

  try {
    const dir = `${rootDir}/${repoId}`;
    sendProgress('Initializing repository');

    // Try each clone URL until one works
    let lastError: Error | null = null;
    let cloneResult = null;

    for (const cloneUrl of cloneUrls) {
      try {
        sendProgress('Fetching repository metadata', 0, 1);
        
        const onProgress = (progress: { phase: string; loaded?: number; total?: number }) => {
          sendProgress(progress.phase, progress.loaded, progress.total);
        };

        // Initialize with minimal clone (refs only)
        cloneResult = await git.clone({
          dir,
          url: cloneUrl,
          ref: 'HEAD',
          singleBranch: false, // We want all branches for refs
          depth: 1, // Minimal depth for refs
          noCheckout: true, // Don't checkout files yet
          noTags: true, // Skip tags for speed
          onProgress,
        });

        break; // Success, exit loop
      } catch (error: any) {
        console.warn(`Clone failed for URL ${cloneUrl}:`, error);
        lastError = error;
        continue; // Try next URL
      }
    }

    if (!cloneResult) {
      throw lastError || new Error('All clone URLs failed');
    }

    // Get repository metadata
    const branches = await git.listBranches({ dir });
    const headCommit = await git.resolveRef({ dir, ref: 'HEAD' });

    // Update tracking
    repoDataLevels.set(repoId, 'refs');
    clonedRepos.add(repoId);

    // Cache the results
    const cache: RepoCache = {
      repoId,
      lastUpdated: Date.now(),
      headCommit,
      dataLevel: 'refs',
      branches: branches.map((name: string) => ({ name, commit: headCommit })),
      cloneUrls,
    };
    
    await cacheManager.setRepoCache(cache);

    sendProgress('Repository initialized');
    return {
      success: true,
      repoId,
      dataLevel: 'refs' as const,
      branches: cache.branches,
      headCommit,
      fromCache: false,
    };
  } catch (error: any) {
    console.error(`Repository initialization failed for ${repoId}:`, error);
    return {
      success: false,
      repoId,
      error: error.message || String(error),
      fromCache: false,
    };
  }
};

/**
 * Ensure repository has shallow clone data (HEAD commit + tree) with smart caching
 * This enables file listing and content access for the default branch
 */
const ensureShallowClone = async ({
  repoId,
  branch,
}: {
  repoId: string;
  branch?: string;
}) => {
  const sendProgress = (phase: string, loaded?: number, total?: number) => {
    self.postMessage({
      type: 'clone-progress',
      repoId,
      phase,
      loaded,
      total,
    });
  };

  const dir = `${rootDir}/${repoId}`;
  
  // Use robust multi-fallback branch resolution
  let targetBranch: string = branch || 'main'; // Initialize with fallback
  try {
    targetBranch = await resolveRobustBranchInWorker(dir, branch);
    const currentLevel = repoDataLevels.get(repoId);

    // If we already have shallow or full data, no need to fetch
    if (currentLevel === 'shallow' || currentLevel === 'full') {
      sendProgress('Using existing shallow clone');
      return {
        success: true,
        repoId,
        branch,
        dataLevel: currentLevel,
        fromCache: true,
      };
    }

    // Check if we need to initialize first
    if (!clonedRepos.has(repoId)) {
      throw new Error('Repository not initialized. Call initializeRepo first.');
    }

    sendProgress('Fetching branch content', 0, 1);

    const onProgress = (progress: { phase: string; loaded?: number; total?: number }) => {
      sendProgress(progress.phase, progress.loaded, progress.total);
    };

    // Fetch the specific branch with shallow clone
    await git.fetch({
      dir,
      ref: targetBranch,
      depth: 1,
      singleBranch: true,
      onProgress,
    });

    // Checkout the branch
    await git.checkout({
      dir,
      ref: targetBranch,
    });

    // Update tracking
    repoDataLevels.set(repoId, 'shallow');

    // Update cache
    const cache = await cacheManager.getRepoCache(repoId);
    if (cache) {
      cache.dataLevel = 'shallow';
      cache.lastUpdated = Date.now();
      await cacheManager.setRepoCache(cache);
    }

    sendProgress('Shallow clone ready');
    return {
      success: true,
      repoId,
      branch: targetBranch,
      dataLevel: 'shallow' as const,
    };
  } catch (error: any) {
    console.error(`Shallow clone failed for ${repoId}:`, error);
    // If targetBranch wasn't assigned due to error, use fallback
    if (!targetBranch) {
      targetBranch = branch || 'main';
    }
    return {
      success: false,
      repoId,
      branch: targetBranch,
      error: error.message || String(error),
      fromCache: false,
    };
  }
};

/**
 * Legacy clone function - now uses smart initialization strategy
 * Checks cache and only downloads when necessary
 */
const clone = async ({
  repoId,
  cloneUrls,
}: {
  repoId: string;
  cloneUrls: string[];
}) => {
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
      fromCache: initResult.fromCache,
    };
  } catch (error: any) {
    console.error(`Clone failed for ${repoId}:`, error);
    return {
      success: false,
      repoId,
      error: error.message || String(error),
    };
  }
};

/**
 * Clear clone cache and data level tracking
 */
const clearCloneCache = async () => {
  clonedRepos.clear();
  repoDataLevels.clear();
  
  // Also clear persistent cache
  try {
    await cacheManager.init();
    const db = (cacheManager as any).db;
    if (db) {
      const transaction = db.transaction(['repos'], 'readwrite');
      const store = transaction.objectStore('repos');
      await new Promise((resolve, reject) => {
        const request = store.clear();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(undefined);
      });
    }
  } catch (error) {
    console.warn('Failed to clear persistent cache:', error);
  }
};

/**
 * Enhanced delete repository function that also clears cache
 */
async function deleteRepo({ repoId }: { repoId: string }) {
  // Remove from tracked sets
  clonedRepos.delete(repoId);
  repoDataLevels.delete(repoId);

  // Remove from persistent cache
  try {
    await cacheManager.deleteRepoCache(repoId);
  } catch (error) {
    console.warn(`Failed to delete cache for ${repoId}:`, error);
  }

  // Remove directory from LightningFS
  const fs = new LightningFS('nostr-git');
  const dir = `${rootDir}/${repoId}`;
  try {
    // Recursively delete all files and subdirectories
    async function rmrf(path: string) {
      let stat;
      try {
        stat = await fs.promises.stat(path);
      } catch {
        return; // Path does not exist
      }
      if (stat.type === 'dir') {
        const entries = await fs.promises.readdir(path);
        for (const entry of entries) {
          await rmrf(`${path}/${entry}`);
        }
        await fs.promises.rmdir(path);
      } else {
        await fs.promises.unlink(path);
      }
    }
    await rmrf(dir);
    return { success: true, repoId };
  } catch (error) {
    console.error(`Failed to delete repo directory ${dir}:`, error);
    return { success: false, repoId, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Get the total number of commits in a repository
 * This is a lightweight operation that doesn't require downloading the full history
 */
async function getCommitCount({
  repoId,
  branch,
}: {
  repoId: string;
  branch?: string;
}): Promise<{
  success: boolean;
  count?: number;
  repoId: string;
  branch: string;
  fromCache?: boolean;
  error?: string;
}> {
  const dir = `${rootDir}/${repoId}`;
  
  // Use robust multi-fallback branch resolution
  let targetBranch: string = branch || 'main'; // Initialize with fallback
  try {
    targetBranch = await resolveRobustBranchInWorker(dir, branch);
    
    // First check if we already have the full history
    const currentLevel = repoDataLevels.get(repoId);
    if (currentLevel === 'full') {
      // If we have full history, we can count commits locally
      const commits = await git.log({
        dir,
        ref: targetBranch,
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
    const cloneUrl = `https://github.com/${repoId}.git`;
    
    // This is a lightweight operation that doesn't download the full history
    const refs = await git.listServerRefs({
      http: http,
      url: cloneUrl,
      prefix: 'refs/heads/',
      symrefs: true,
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
        ref: branch,
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function isRepoCloned(dir: string): Promise<boolean> {
  try {
    await git.resolveRef({ dir, ref: 'HEAD' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure repository has full history (for commit history, file history, etc.)
 */
const ensureFullClone = async ({
  repoId,
  branch,
  depth = 50,
}: {
  repoId: string;
  branch?: string;
  depth?: number;
}) => {
  const dir = `${rootDir}/${repoId}`;
  
  // Use robust multi-fallback branch resolution
  const targetBranch = await resolveRobustBranchInWorker(dir, branch);
  const currentLevel = repoDataLevels.get(repoId);
  if (currentLevel === 'full') {
    return { success: true, repoId, cached: true, level: currentLevel };
  }

  if (!clonedRepos.has(repoId)) {
    if(!await isRepoCloned(`${rootDir}/${repoId}`)) {
      return {
        success: false,
        repoId,
        error: 'Repository not initialized. Call initializeRepo first.'
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
    // Fetch more history - unshallow the repository
    await git.fetch({
      dir,
      remote: 'origin',
      ref: branch,
      depth: Math.min(depth, 100), // Cap at 100 to prevent excessive downloads
      singleBranch: true,
      tags: false,
      onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
        sendProgress(`Full clone: ${progress.phase}`, progress.loaded, progress.total);
      }
    });

    sendProgress('Full clone completed');

    // Update data level
    repoDataLevels.set(repoId, 'full');
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
  if (!clonedRepos.has(repoId)) return 'none';
  return repoDataLevels.get(repoId) || 'none';
};

/**
 * Get commit history for a repository
 * Ensures the repository has sufficient history depth before fetching commits
 */
const getCommitHistory = async ({
  repoId,
  branch,
  depth = 50,
}: {
  repoId: string;
  branch?: string;
  depth?: number;
}) => {
  const dir = `${rootDir}/${repoId}`;
  
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
      const actualDataLevel = repoDataLevels.get(repoId);
      if (actualDataLevel !== 'full') {
        console.warn(`Expected full clone but got ${actualDataLevel}, forcing full clone...`);
        // Force a full clone by temporarily removing from cache
        const wasCloned = clonedRepos.has(repoId);
        clonedRepos.delete(repoId);
        repoDataLevels.delete(repoId);
        
        const retryResult = await ensureFullClone({ repoId, branch, depth: currentDepth });
        if (!retryResult.success) {
          throw new Error(`Failed to force full clone: ${retryResult.error}`);
        }
        
        if (wasCloned) {
          clonedRepos.add(repoId);
        }
      }

      const commits = await git.log({
        dir,
        ref: branch,
        depth: currentDepth,
      });

      return {
        success: true,
        commits,
        repoId,
        branch,
        actualDepth: commits.length,
        requestedDepth: currentDepth,
      };
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt + 1} failed for getCommitHistory ${repoId}:`, error);
      
      // Handle different types of errors
      if (error && error.message) {
        if (error.message.includes('Could not find') && attempt < maxAttempts - 1) {
          console.warn(`NotFoundError in getCommitHistory for ${repoId}, deepening and retrying...`);
          // Exponentially increase depth
          currentDepth = Math.min(currentDepth * 2, 1000);
          attempt++;
          continue;
        } else if (error.message.includes('shallow') && attempt < maxAttempts - 1) {
          console.warn(`Shallow clone issue for ${repoId}, forcing full clone...`);
          // Force re-clone by clearing cache
          clonedRepos.delete(repoId);
          repoDataLevels.delete(repoId);
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
    finalDepth: currentDepth,
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
  try {
    const dir = `${rootDir}/${repoId}`;
    
    // Use robust multi-fallback branch resolution
    const effectiveTargetBranch = await resolveRobustBranchInWorker(dir, targetBranch);
    
    // Ensure we have at least shallow clone data
    await ensureShallowClone({ repoId, branch: targetBranch });
    
    // Reconstruct a minimal patch object for analysis
    const patch = {
      id: patchData.id,
      commits: patchData.commits,
      baseBranch: patchData.baseBranch,
      raw: { content: patchData.rawContent }
    };
    
    // Perform the merge analysis
    const result = await analyzePatchMergeability(git, dir, patch as any, targetBranch);
    
    return result;
  } catch (error) {
    return {
      canMerge: false,
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: [],
      upToDate: false,
      fastForward: false,
      patchCommits: [],
      analysis: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  }
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
  await git.clone({ dir, url: sourceUrl, singleBranch: true, depth: 1 });

  const remoteUrl = await createRemoteRepo(targetHost, targetToken, targetUsername, targetRepo);

  //await git.addRemote({ dir, remote: 'origin', url: remoteUrl });
  await git.push({ dir, remote: 'origin', ref: 'main', force: true });

  const event = finalizeEvent({
    kind: 34,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', sourceUrl],
      ['e', remoteUrl],
      ['t', 'fork']
    ],
    content: `Forked ${sourceUrl} to ${remoteUrl}`
  }, nostrPrivateKey);

  const pool = new SimplePool();
  await Promise.all(pool.publish(relays, event));

  return remoteUrl;
};

const createRemoteRepo = async (
  host: string,
  token: string,
  user: string,
  repo: string
): Promise<string> => {
  switch (host) {
    case 'github': {
      const { data } = await axios.post('https://api.github.com/user/repos', { name: repo }, {
        headers: { Authorization: `token ${token}` }
      });
      return data.clone_url;
    }
    case 'gitlab': {
      const { data } = await axios.post('https://gitlab.com/api/v4/projects', { name: repo }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return data.http_url_to_repo;
    }
    case 'gitea': {
      const { data } = await axios.post(`https://gitea.com/api/v1/user/repos`, { name: repo }, {
        headers: { Authorization: `token ${token}` }
      });
      return data.clone_url;
    }
    default:
      throw new Error(`Unknown targetHost: ${host}`);
  }
};

expose({ 
  cloneAndFork, 
  clone, 
  smartInitializeRepo,
  initializeRepo,
  ensureShallowClone,
  ensureFullClone,
  getRepoDataLevel,
  clearCloneCache,
  getCommitHistory,
  getCommitCount,
  deleteRepo,
  analyzePatchMerge
});
