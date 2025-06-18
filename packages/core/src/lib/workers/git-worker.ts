import { expose } from 'comlink';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import axios from 'axios';
import { finalizeEvent, SimplePool } from 'nostr-tools';
import { GitProvider, IsomorphicGitProvider } from '@nostr-git/git-wrapper';
import { rootDir } from '../git.js';
import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

const clonedRepos = new Set<string>();
const repoDataLevels = new Map<string, 'refs' | 'shallow' | 'full'>();

const git: GitProvider = new IsomorphicGitProvider({
  fs: new LightningFS('nostr-git'),
  http: http,
  corsProxy: 'https://cors.isomorphic-git.org',
});

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
  if (clonedRepos.has(repoId)) {
    console.log(`Repository ${repoId} already initialized, skipping...`);
    return { success: true, repoId, cached: true, level: repoDataLevels.get(repoId) };
  }

  if (await isRepoCloned(`${rootDir}/${repoId}`)) {
    clonedRepos.add(repoId);
    repoDataLevels.set(repoId, 'shallow');
    console.log(`Repository ${repoId} already exists, skipping...`);
    return { success: true, repoId, cached: true, level: 'shallow' };
  }

  const dir = `${rootDir}/${repoId}`;
  const cloneUrl = cloneUrls.find((url) => url.startsWith("https://"));
  if (!cloneUrl) return { success: false, repoId, error: 'No HTTPS clone URL found' };

  console.log(`Initializing repository ${repoId} with minimal data...`);

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

  sendProgress('Fetching repository metadata...');

  try {
    await git.init({ dir, bare: false });
    await git.addRemote({ dir, remote: 'origin', url: cloneUrl });
    await git.fetch({
      dir,
      remote: 'origin',
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
  const currentLevel = repoDataLevels.get(repoId);
  if (currentLevel === 'shallow' || currentLevel === 'full') {
    return { success: true, repoId, cached: true, level: currentLevel };
  }

  if (!clonedRepos.has(repoId)) {
    if (await isRepoCloned(`${rootDir}/${repoId}`)) {
      clonedRepos.add(repoId);
      repoDataLevels.set(repoId, 'shallow');
      console.log(`Repository ${repoId} already exists, skipping...`);
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
  try {
    const cloneResult = await ensureFullClone({ repoId, branch, depth });
    if (!cloneResult.success) {
      throw new Error(`Failed to ensure full clone: ${cloneResult.error}`);
    }

    const dir = `${rootDir}/${repoId}`;

    const commits = await git.log({
      dir,
      ref: branch,
      depth: Math.max(depth, 100),
    });

    return {
      success: true,
      commits,
      repoId,
      branch,
    };
  } catch (error) {
    console.error(`Error getting commit history for ${repoId}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      repoId,
      branch,
    };
  }
};

expose({
  cloneAndFork,
  clone,
  initializeRepo,
  ensureShallowClone,
  ensureFullClone,
  getRepoDataLevel,
  clearCloneCache,
  getCommitHistory
});
