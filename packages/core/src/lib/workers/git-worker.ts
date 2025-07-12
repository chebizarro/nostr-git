import { expose } from 'comlink';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import axios from 'axios';
import { finalizeEvent, SimplePool } from 'nostr-tools';
import { GitProvider, IsomorphicGitProvider } from '@nostr-git/git-wrapper';
import { rootDir } from '../git.js';
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

const clonedRepos = new Set<string>();
const repoDataLevels = new Map<string, 'refs' | 'shallow' | 'full'>();

/**
 * Get the total number of commits in a repository
 * This is a lightweight operation that doesn't require downloading the full history
 */
async function getCommitCount({
  repoId,
  branch = 'main',
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
  try {
    const dir = `${rootDir}/${repoId}`;
    
    // First check if we already have the full history
    const currentLevel = repoDataLevels.get(repoId);
    if (currentLevel === 'full') {
      // If we have full history, we can count commits locally
      const commits = await git.log({
        dir,
        ref: branch,
      });
      return {
        success: true,
        count: commits.length,
        repoId,
        branch,
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
    const branchRef = refs.find((ref: { ref: string }) => ref.ref === `refs/heads/${branch}`);
    
    if (!branchRef) {
      return {
        success: false,
        repoId,
        branch,
        error: `Branch ${branch} not found`
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
        branch,
        fromCache: true
      };
    }
    
    // If we don't have the repo cloned yet, we can't get an accurate count
    // without cloning first
    return {
      success: false,
      repoId,
      branch,
      error: 'Repository not fully cloned. Clone the repository first to get commit count.'
    };
  } catch (error) {
    console.error(`Error getting commit count for ${repoId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      repoId,
      branch,
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

  if (clonedRepos.has(repoId)) {
    console.log(`Repository ${repoId} already initialized, skipping...`);
    return { success: true, repoId, cached: true, level: repoDataLevels.get(repoId) };
  }

  if (await isRepoCloned(`${rootDir}/${repoId}`)) {
    clonedRepos.add(repoId);
    repoDataLevels.set(repoId, 'shallow');
    console.log(`Repository ${repoId} already exists, skipping...`);
    await git.fetch({
      dir: `${rootDir}/${repoId}`,
      singleBranch: true,
      tags: false,
      onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
        sendProgress(`Updating shallow clone: ${progress.phase}`, progress.loaded, progress.total);
      }
    });
    return { success: true, repoId, cached: true, level: 'shallow' };
  }

  const dir = `${rootDir}/${repoId}`;
  const cloneUrl = cloneUrls.find((url) => url.startsWith("https://"));
  if (!cloneUrl) return { success: false, repoId, error: 'No HTTPS clone URL found' };

  console.log(`Initializing repository ${repoId} with minimal data...`);

  sendProgress('Fetching repository metadata...');

  try {
    //await git.init({ dir, bare: false });
    //await git.addRemote({ dir, remote: 'origin', url: cloneUrl });
    await git.clone({
      dir,
      url: cloneUrl,
      depth: 1,
      singleBranch: false,
      tags: false,
      prune: true,
      onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
        sendProgress(`Fetching refs: ${progress.phase}`, progress.loaded, progress.total);
      }
    });

    sendProgress('Repository initialized with refs');

    clonedRepos.add(repoId);
    repoDataLevels.set(repoId, 'refs');
    console.log(`Repository ${repoId} initialized with refs successfully`);

    return { success: true, repoId, cached: false, level: 'refs' };
  } catch (error: any) {
    console.error(`Failed to initialize repository ${repoId}:`, error);
    return { success: false, repoId, error: error.message };
  }
};

/**
 * Ensure repository has shallow clone data (HEAD commit + tree)
 * This enables file listing and content access for the default branch
 */
const ensureShallowClone = async ({
  repoId,
  branch = 'main',
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
      progress: loaded && total ? loaded / total : undefined
    });
  };
  
  const currentLevel = repoDataLevels.get(repoId);
  if (currentLevel === 'shallow' || currentLevel === 'full') {
    await git.fetch({
      dir: `${rootDir}/${repoId}`,
      ref: branch,
      singleBranch: true,
      tags: false,
      onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
        sendProgress(`Updating shallow clone: ${progress.phase}`, progress.loaded, progress.total);
      }
    });
    return { success: true, repoId, cached: true, level: currentLevel };
  }

  if (!clonedRepos.has(repoId)) {
    if (await isRepoCloned(`${rootDir}/${repoId}`)) {
      clonedRepos.add(repoId);
      repoDataLevels.set(repoId, 'shallow');
      console.log(`Repository ${repoId} already exists, skipping...`);
      await git.fetch({
        dir: `${rootDir}/${repoId}`,
        ref: branch,
        singleBranch: true,
        tags: false,
        onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
          sendProgress(`Updating shallow clone: ${progress.phase}`, progress.loaded, progress.total);
        }
      });
      return { success: true, repoId, cached: true, level: 'shallow' };
    }
    return {
      success: false,
      repoId,
      error: 'Repository not initialized. Call initializeRepo first.'
    };
  }

  const dir = `${rootDir}/${repoId}`;

  console.log(`Upgrading repository ${repoId} to shallow clone for branch ${branch}...`);

  sendProgress(`Fetching ${branch} branch data...`);

  try {
    await git.fetch({
      dir,
      remote: 'origin',
      ref: branch,
      depth: 1,
      singleBranch: true,
      tags: false,
      onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
        sendProgress(`Shallow clone: ${progress.phase}`, progress.loaded, progress.total);
      }
    });

    await git.checkout({ dir, ref: branch });

    sendProgress('Shallow clone completed');

    repoDataLevels.set(repoId, 'shallow');
    console.log(`Repository ${repoId} upgraded to shallow clone successfully`);

    return { success: true, repoId, cached: false, level: 'shallow' };
  } catch (error: any) {
    console.error(`Failed to create shallow clone for repository ${repoId}:`, error);
    return { success: false, repoId, error: error.message };
  }
};

/**
 * Ensure repository has full history (for commit history, file history, etc.)
 */
const ensureFullClone = async ({
  repoId,
  branch = 'main',
  depth = 50,
}: {
  repoId: string;
  branch?: string;
  depth?: number;
}) => {
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

  const dir = `${rootDir}/${repoId}`;

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
 * Legacy clone function - now uses progressive loading strategy
 * Initializes repo and ensures shallow clone for backward compatibility
 */
const clone = async ({
  repoId,
  cloneUrls,
}: {
  repoId: string;
  cloneUrls: string[];
}) => {
  // Initialize with refs first
  const initResult = await initializeRepo({ repoId, cloneUrls });
  if (!initResult.success) {
    return initResult;
  }

  // If already cached at a higher level, return that
  if (initResult.cached && initResult.level !== 'refs') {
    return initResult;
  }

  // Upgrade to shallow clone for backward compatibility
  const shallowResult = await ensureShallowClone({ repoId });
  return shallowResult;
};

/**
 * Get the current data level for a repository
 */
const getRepoDataLevel = (repoId: string): 'none' | 'refs' | 'shallow' | 'full' => {
  if (!clonedRepos.has(repoId)) return 'none';
  return repoDataLevels.get(repoId) || 'none';
};

/**
 * Clear clone cache and data level tracking
 */
const clearCloneCache = () => {
  clonedRepos.clear();
  repoDataLevels.clear();
};

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

/**
 * Get commit history for a repository
 * Ensures the repository has sufficient history depth before fetching commits
 */
const getCommitHistory = async ({
  repoId,
  branch = 'main',
  depth = 50,
}: {
  repoId: string;
  branch?: string;
  depth?: number;
}) => {
  const dir = `${rootDir}/${repoId}`;
  let attempt = 0;
  let maxAttempts = 2;
  let lastError = null;
  let currentDepth = Math.max(depth, 100);

  while (attempt < maxAttempts) {
    try {
      const cloneResult = await ensureFullClone({ repoId, branch, depth: currentDepth });
      if (!cloneResult.success) {
        throw new Error(`Failed to ensure full clone: ${cloneResult.error}`);
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
      };
    } catch (error: any) {
      lastError = error;
      // Defensive deepening: if NotFoundError, try deepening once
      if (error && error.message && error.message.includes('Could not find') && attempt === 0) {
        console.warn(`NotFoundError in getCommitHistory for ${repoId}, deepening and retrying...`);
        currentDepth = 500; // Try a much larger depth
        attempt++;
        continue;
      } else {
        console.error(`Error getting commit history for ${repoId}:`, error);
        break;
      }
    }
  }
  return {
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    repoId,
    branch,
    retried: attempt > 0
  };
};

async function deleteRepo({ repoId }: { repoId: string }) {
  // Remove from tracked sets
  clonedRepos.delete(repoId);
  repoDataLevels.delete(repoId);

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
}

/**
 * Analyze if a patch can be merged cleanly into the target branch
 */
async function analyzePatchMerge({
  repoId,
  patchData,
  targetBranch = 'main'
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

expose({ 
  cloneAndFork, 
  clone, 
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
