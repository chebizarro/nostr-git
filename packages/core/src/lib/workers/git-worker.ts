import { expose } from 'comlink';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import axios from 'axios';
import { finalizeEvent, SimplePool } from 'nostr-tools';
import { GitProvider, IsomorphicGitProvider } from '@nostr-git/git-wrapper';
import { ensureRepoFromEvent, rootDir, getDefaultBranch } from '../git.js';
import { Buffer } from 'buffer';
import { analyzePatchMergeability, type MergeAnalysisResult } from '../merge-analysis.js';

// Authentication configuration
interface AuthToken {
  host: string;
  token: string;
}

interface AuthConfig {
  tokens: AuthToken[];
}

// Global authentication configuration
let authConfig: AuthConfig = { tokens: [] };

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

const git: GitProvider = new IsomorphicGitProvider({
  fs: new LightningFS('nostr-git'),
  http: http,
  corsProxy: 'https://cors.isomorphic-git.org',
});

/**
 * Set authentication configuration for git operations
 */
function setAuthConfig(config: AuthConfig): void {
  authConfig = config;
  console.log('Git worker authentication configured for', config.tokens.length, 'hosts');
}

/**
 * Get authentication callback for a given URL
 */
function getAuthCallback(url: string) {
  if (!authConfig.tokens.length) {
    return undefined;
  }

  // Extract hostname from URL
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch (error) {
    console.warn('Failed to parse URL for authentication:', url);
    return undefined;
  }

  // Find matching token
  const matchingToken = authConfig.tokens.find(token => {
    // Support both exact matches and subdomain matches
    return hostname === token.host || hostname.endsWith('.' + token.host);
  });

  if (matchingToken) {
    console.log('Using authentication for', hostname);
    return () => ({
      username: 'token',
      password: matchingToken.token
    });
  }

  return undefined;
}

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
      const result = await git.resolveRef({ dir, ref: branchName });
      return branchName;
    } catch (error) {
      continue;
    }
  }
  
  // If all specific branches fail, try to find any existing branch
  try {
    const branches = await git.listBranches({ dir });
    if (branches.length > 0) {
      const firstBranch = branches[0];
      console.warn(`All specific branch resolution attempts failed, using first available branch: ${firstBranch}`);
      return firstBranch;
    }
  } catch (error) {
    console.warn('Failed to list branches:', error);
  }
  
  // Ultimate fallback - this should rarely happen
  throw new Error(`No branches found in repository at ${dir}. Tried: ${branchesToTry.join(', ')}`);
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
  console.log('[NEEDSUPDATE DEBUG] needsUpdate called for repoId:', repoId);
  if (!cache) {
    console.log('[NEEDSUPDATE DEBUG] No cache, needs update');
    return true;
  }
  
  // Check if cache is too old (older than 1 hour)
  const maxCacheAge = 60 * 60 * 1000; // 1 hour
  if (Date.now() - cache.lastUpdated > maxCacheAge) {
    console.log('[NEEDSUPDATE DEBUG] Cache too old, needs update');
    return true;
  }

  try {
    // Check remote HEAD for the main branch
    console.log('[NEEDSUPDATE DEBUG] Checking remote HEAD...');
    const cloneUrl = cloneUrls[0];
    if (!cloneUrl) return true;

    const refs = await git.listServerRefs({
      http: http,
      url: cloneUrl,
      prefix: 'refs/heads/',
      symrefs: true,
    });

    console.log('[NEEDSUPDATE DEBUG] Available refs:', refs.map((r: any) => r.ref));
    const mainBranch = refs.find((ref: any) => 
      ref.ref === 'refs/heads/main' || ref.ref === 'refs/heads/master'
    );
    console.log('[NEEDSUPDATE DEBUG] Found main branch:', mainBranch);

    if (!mainBranch) {
      console.log('[NEEDSUPDATE DEBUG] No main/master branch found, needs update');
      return true;
    }

    // Compare with cached HEAD commit
    const needsUpdate = mainBranch.oid !== cache.headCommit;
    console.log('[NEEDSUPDATE DEBUG] Needs update:', needsUpdate, 'cached:', cache.headCommit, 'remote:', mainBranch.oid);
    return needsUpdate;
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
        const authCallback = getAuthCallback(cloneUrl);
        cloneResult = await git.clone({
          dir,
          url: cloneUrl,
          ref: 'HEAD',
          singleBranch: false, // We want all branches for refs
          depth: 1, // Minimal depth for refs
          noCheckout: true, // Don't checkout files yet
          noTags: true, // Skip tags for speed
          onProgress,
          ...(authCallback && { onAuth: authCallback }),
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

    // Get remote URL for fetch operation
    const remotes = await git.listRemotes({ dir });
    const originRemote = remotes.find((r: any) => r.remote === 'origin');
    
    if (!originRemote || !originRemote.url) {
      throw new Error('Origin remote not found or has no URL configured');
    }
    
    // Fetch the specific branch with shallow clone
    const authCallback = getAuthCallback(originRemote.url);
    await git.fetch({
      dir,
      url: originRemote.url,
      ref: targetBranch,
      depth: 1,
      singleBranch: true,
      onProgress,
      ...(authCallback && { onAuth: authCallback }),
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
      targetBranch = branch || 'main'; // Will be resolved below
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
    // Check if .git directory exists instead of using git.resolveRef
    const fs = new LightningFS('nostr-git');
    const gitDir = `${dir}/.git`;
    const stat = await fs.promises.stat(gitDir);
    return stat.isDirectory();
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
        ref: targetBranch,
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
    await ensureShallowClone({ repoId, branch: effectiveTargetBranch });
    
    // Create patch object for analysis
    const patch = {
      id: patchData.id,
      commits: patchData.commits,
      baseBranch: patchData.baseBranch,
      raw: { content: patchData.rawContent }
    };
    
    // Perform the merge analysis
    const result = await analyzePatchMergeability(git, dir, patch as any, effectiveTargetBranch);
    
    return result;
  } catch (error) {
    return {
      canMerge: false,
      hasConflicts: false,
      conflictFiles: [],
      conflictDetails: [],
      upToDate: false,
      fastForward: false,
      targetCommit: undefined,
      remoteCommit: undefined,
      patchCommits: [],
      analysis: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Parse patch content to extract file changes with unified diff format preserved
 */
function parsePatchContent(patchLines: string[]): Array<{
  filepath: string;
  type: 'add' | 'modify' | 'delete';
  content: string;
}> {
  const changes: Array<{
    filepath: string;
    type: 'add' | 'modify' | 'delete';
    content: string;
  }> = [];
  
  let currentFile: string | null = null;
  let currentContent: string[] = [];
  let currentType: 'add' | 'modify' | 'delete' = 'modify';
  let inFileDiff = false;
  
  for (let i = 0; i < patchLines.length; i++) {
    const line = patchLines[i];
    
    // Skip undefined or null lines
    if (!line || typeof line !== 'string') {
      continue;
    }
    
    // Detect file headers
    if (line.startsWith('diff --git')) {
      // Save previous file if exists
      if (currentFile && currentContent.length > 0) {
        changes.push({
          filepath: currentFile,
          type: currentType,
          content: currentContent.join('\n')
        });
      }
      
      // Extract file path from diff header
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      currentFile = match ? match[2] : null;
      currentContent = [];
      currentType = 'modify'; // Default
      inFileDiff = false;
    } else if (line.startsWith('new file mode')) {
      currentType = 'add';
    } else if (line.startsWith('deleted file mode')) {
      currentType = 'delete';
    } else if (line.startsWith('---') && currentFile) {
      // Start collecting the unified diff content
      currentContent.push(line);
      inFileDiff = true;
    } else if (inFileDiff && currentFile) {
      // Preserve the entire unified diff format
      currentContent.push(line);
    }
  }
  
  // Save last file
  if (currentFile && currentContent.length > 0) {
    changes.push({
      filepath: currentFile,
      type: currentType,
      content: currentContent.join('\n')
    });
  }
  
  return changes;
}

/**
 * Extract new file content from a unified diff patch for file additions
 */
function extractNewFileContentFromPatch(patchContent: string): string {
  const lines = patchContent.split('\n');
  const contentLines: string[] = [];
  let inContent = false;
  
  for (const line of lines) {
    // Skip header lines until we reach the actual diff content
    if (line.startsWith('@@')) {
      inContent = true;
      continue;
    }
    
    if (inContent) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        // This is a new line being added
        contentLines.push(line.substring(1)); // Remove the '+' prefix
      } else if (!line.startsWith('-') && !line.startsWith('\\')) {
        // This is a context line (unchanged)
        contentLines.push(line.startsWith(' ') ? line.substring(1) : line);
      }
      // Skip lines starting with '-' (deletions) and '\\' (no newline indicators)
    }
  }
  
  return contentLines.join('\n');
}

/**
 * Apply a unified diff patch to existing file content
 */
function applyUnifiedDiffPatch(existingContent: string, patchContent: string): string {
  const existingLines = existingContent.split('\n');
  const patchLines = patchContent.split('\n');
  const resultLines: string[] = [];
  
  let existingIndex = 0;
  let inHunk = false;
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  
  for (const line of patchLines) {
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@\s+-?(\d+),?\d*\s+\+(\d+),?\d*\s+@@/);
    if (hunkMatch) {
      hunkOldStart = parseInt(hunkMatch[1]) - 1; // Convert to 0-based index
      hunkNewStart = parseInt(hunkMatch[2]) - 1; // Convert to 0-based index
      
      // Copy any lines before this hunk
      while (existingIndex < hunkOldStart) {
        resultLines.push(existingLines[existingIndex]);
        existingIndex++;
      }
      
      inHunk = true;
      continue;
    }
    
    if (inHunk) {
      if (line.startsWith(' ')) {
        // Context line - copy from existing content
        resultLines.push(line.substring(1));
        existingIndex++;
      } else if (line.startsWith('+')) {
        // Addition - add new line
        resultLines.push(line.substring(1));
      } else if (line.startsWith('-')) {
        // Deletion - skip this line from existing content
        existingIndex++;
      } else if (line.startsWith('\\')) {
        // No newline indicator - ignore
        continue;
      } else {
        // End of hunk or unknown line
        inHunk = false;
      }
    }
  }
  
  // Copy any remaining lines from the existing content
  while (existingIndex < existingLines.length) {
    resultLines.push(existingLines[existingIndex]);
    existingIndex++;
  }
  
  return resultLines.join('\n');
}

/**
 * Apply a patch to the repository and push to all remotes
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
  // Destructure parameters from the params object
  const {
    repoId,
    patchData,
    targetBranch,
    mergeCommitMessage,
    authorName,
    authorEmail,
    onProgress
  } = params;
  const progress = onProgress || (() => {});
  
  try {
    const dir = `${rootDir}/${repoId}`;
    progress('Initializing merge...', 0);
    
    // Use robust multi-fallback branch resolution
    const effectiveTargetBranch = await resolveRobustBranchInWorker(dir, targetBranch);
    progress('Branch resolved', 10);
    
    // Ensure we have full clone for merge operations
    await ensureFullClone({ repoId, branch: effectiveTargetBranch });
    progress('Repository prepared', 20);
    
    // Check if patch can be merged cleanly first
    const mergeAnalysis = await analyzePatchMerge({
      repoId,
      patchData,
      targetBranch: effectiveTargetBranch
    });
    
    if (!mergeAnalysis.canMerge) {
      return {
        success: false,
        error: mergeAnalysis.hasConflicts 
          ? `Merge conflicts detected in files: ${mergeAnalysis.conflictFiles.join(', ')}`
          : mergeAnalysis.errorMessage || 'Patch cannot be merged'
      };
    }
    
    progress('Merge analysis complete', 30);
    
    // Checkout target branch
    await git.checkout({ dir, ref: effectiveTargetBranch });
    progress('Checked out target branch', 40);
    
    // Apply the patch using git apply
    try {
      // For now, we'll use a simpler approach: parse the patch and apply changes manually
      // This is a simplified implementation - in production you'd want more robust patch parsing
      
      // Validate patch data
      if (!patchData.rawContent) {
        throw new Error('Patch rawContent is missing or undefined');
      }
      
      if (typeof patchData.rawContent !== 'string') {
        throw new Error(`Patch rawContent must be a string, got: ${typeof patchData.rawContent}`);
      }
      
      // Parse patch content to extract file changes
      const patchLines = patchData.rawContent.split('\n');
      const fileChanges = parsePatchContent(patchLines);
      
      // Apply each file change
      for (let i = 0; i < fileChanges.length; i++) {
        const change = fileChanges[i];
        
        if (change.type === 'modify' || change.type === 'add') {
          if (!change.content || typeof change.content !== 'string') {
            throw new Error(`Invalid content for file ${change.filepath}: expected string, got ${typeof change.content}`);
          }
          
          // Get the filesystem from the isomorphic-git provider
          const fs = (git as any).fs || (git as any).options?.fs;
          if (!fs) {
            throw new Error('Filesystem not available from git provider');
          }
          
          const fullPath = `${dir}/${change.filepath}`;
          
          // Ensure the directory exists
          const pathParts = change.filepath.split('/');
          if (pathParts.length > 1) {
            const dirPath = pathParts.slice(0, -1).join('/');
            const fullDirPath = `${dir}/${dirPath}`;
            
            try {
              // Create directory structure if it doesn't exist
              await fs.promises.mkdir(fullDirPath, { recursive: true });
            } catch (error) {
              // Directory might already exist, that's fine
            }
          }
          
          let finalContent: string = '';
          
          if (change.type === 'add') {
            // For new files, extract content from the unified diff format
            finalContent = extractNewFileContentFromPatch(change.content);
          } else {
            // For modifications, apply the patch to the existing file
            let existingContent = '';
            try {
              existingContent = await fs.promises.readFile(fullPath, 'utf8');
              // Apply the unified diff patch to the existing content
              finalContent = applyUnifiedDiffPatch(existingContent, change.content);
            } catch (error) {
              // File doesn't exist, treat as new file
              finalContent = extractNewFileContentFromPatch(change.content);
            }
          }
          
          await fs.promises.writeFile(fullPath, finalContent, 'utf8');
          
          // Stage the file changes
          await git.add({ dir, filepath: change.filepath });
        } else if (change.type === 'delete') {
          await git.remove({ dir, filepath: change.filepath });
        }
      }
      
      progress('Patch applied', 60);
      
      // Get status to verify changes
      const status = await git.statusMatrix({ dir });
      const hasChanges = status.some(([, , worktreeStatus]: [string, number, number]) => worktreeStatus !== 0);
      
      if (!hasChanges) {
        return {
          success: false,
          error: 'No changes to apply - patch may already be merged or invalid'
        };
      }
      
      progress('Changes staged', 70);
      
      // Create merge commit
      const defaultMessage = `Merge patch: ${patchData.id.slice(0, 8)}`;
      const commitMessage = mergeCommitMessage || defaultMessage;
      
      const mergeCommitOid = await git.commit({
        dir,
        message: commitMessage,
        author: {
          name: authorName,
          email: authorEmail
        }
      });
      
      progress('Merge commit created', 80);
      
      // Get all remotes
      const remotes = await git.listRemotes({ dir });
      const pushedRemotes: string[] = [];
      const skippedRemotes: string[] = [];
      
      console.log(`Found ${remotes.length} remotes:`, remotes);
      
      // Check if any remotes are configured
      if (remotes.length === 0) {
        console.warn('No remotes configured for repository - merge commit created locally only');
        return {
          success: true,
          mergeCommitOid,
          pushedRemotes: [],
          skippedRemotes: [],
          warning: 'No remotes configured - changes only applied locally'
        };
      }
      
      // Check if any remotes have valid URLs
      const validRemotes = remotes.filter((remote: any) => remote.url && remote.url.trim() !== '');
      if (validRemotes.length === 0) {
        console.warn('No remotes with valid URLs found - merge commit created locally only');
        return {
          success: true,
          mergeCommitOid,
          pushedRemotes: [],
          skippedRemotes: remotes.map((r: any) => r.remote),
          warning: 'No valid remote URLs - changes only applied locally'
        };
      }
      
      // Push to all remotes with proper URL handling
      const pushErrors: Array<{ remote: string; url: string; error: string; code: string; stack: string }> = [];
      
      for (const remote of remotes) {
        try {
          console.log(`Attempting to push to remote: ${remote.remote} (${remote.url})`);
          
          if (!remote.url) {
            const errorMsg = `Remote ${remote.remote} has no URL configured`;
            console.warn(`Remote ${remote.remote} has no URL configured`);
            pushErrors.push({ remote: remote.remote, url: 'N/A', error: errorMsg, code: 'NO_URL', stack: '' });
            skippedRemotes.push(remote.remote);
            continue;
          }
          
          // Log authentication status
          const authCallback = getAuthCallback(remote.url);
          if (authCallback) {
            console.log(`🔐 Using authentication for ${remote.url}`);
            console.log(`🔐 Available tokens for hosts:`, authConfig.tokens.map(t => t.host));
            // Test the auth callback to see what credentials it provides
            try {
              const testAuth = authCallback();
              console.log(`🔐 Auth callback returns:`, {
                username: testAuth.username,
                passwordLength: testAuth.password?.length || 0,
                passwordPrefix: testAuth.password?.substring(0, 4) + '...' || 'none'
              });
            } catch (authError) {
              console.error(`🔐 Auth callback failed:`, authError);
            }
          } else {
            console.log(`🔓 No authentication configured for ${remote.url}`);
            console.log(`🔓 Available tokens for hosts:`, authConfig.tokens.map(t => t.host));
            console.log(`🔓 Remote hostname:`, new URL(remote.url).hostname);
          }
          
          // Use the remote URL to avoid "remote OR url" error
          await git.push({
            dir,
            url: remote.url,
            ref: effectiveTargetBranch,
            force: true, // Allow non-fast-forward pushes for patch merges
            ...(authCallback && { onAuth: authCallback }),
          });
          
          pushedRemotes.push(remote.remote);
        } catch (pushError: any) {
          const errorMsg = pushError instanceof Error ? pushError.message : String(pushError);
          const errorDetails = {
            remote: remote.remote,
            url: remote.url || 'N/A',
            error: errorMsg,
            code: pushError.code || 'UNKNOWN',
            stack: pushError.stack || 'No stack trace'
          };
          
          pushErrors.push(errorDetails);
          skippedRemotes.push(remote.remote);
        }
      }
      
      progress('Push complete', 100);
      
      // No cleanup needed for this approach
      
      return {
        success: true,
        mergeCommitOid,
        pushedRemotes,
        skippedRemotes,
        pushErrors: pushErrors.length > 0 ? pushErrors : undefined
      };
      
    } catch (applyError) {
      console.error('Failed to apply patch:', applyError);
      
      // Provide more detailed error information
      let errorMessage = 'Unknown error occurred';
      
      if (applyError instanceof Error) {
        errorMessage = applyError.message;
        console.error('Error stack:', applyError.stack);
      } else if (applyError && typeof applyError === 'object') {
        errorMessage = JSON.stringify(applyError);
      } else if (applyError !== null && applyError !== undefined) {
        errorMessage = String(applyError);
      }
      
      // Log patch data for debugging
      console.error('Patch data debug info:', {
        patchId: patchData?.id,
        hasRawContent: !!patchData?.rawContent,
        rawContentType: typeof patchData?.rawContent,
        rawContentLength: patchData?.rawContent?.length,
        baseBranch: patchData?.baseBranch,
        targetBranch,
        effectiveTargetBranch
      });
      
      return {
        success: false,
        error: `Failed to apply patch: ${errorMessage}`
      };
    }
    
  } catch (error) {
    console.error('Merge operation failed:', error);
    return {
      success: false,
      error: `Merge operation failed: ${error instanceof Error ? error.message : String(error)}`
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
  const authCallback = getAuthCallback(sourceUrl);
  await git.clone({ 
    dir, 
    url: sourceUrl, 
    singleBranch: true, 
    depth: 1,
    ...(authCallback && { onAuth: authCallback }),
  });

  const remoteUrl = await createRemoteRepo(targetHost, targetToken, targetUsername, targetRepo);

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
      ...(authCallback && { onAuth: authCallback }),
    });
  } else {
    console.warn('Origin remote not found or has no URL, skipping push');
  }

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

/**
 * Reset local repository to match remote HEAD state
 * This performs a hard reset to remove any local commits that diverge from remote
 */
const resetRepoToRemote = async ({
  repoId,
  branch
}: {
  repoId: string;
  branch?: string;
}) => {
  const dir = `${rootDir}/${repoId}`;
  
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
      ...(authCallback && { onAuth: authCallback }),
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
  analyzePatchMerge,
  applyPatchAndPush,
  resetRepoToRemote,
  setAuthConfig
});
