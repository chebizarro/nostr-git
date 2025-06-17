import { expose } from 'comlink';
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'isomorphic-git/http/web';
import axios from 'axios';
import { finalizeEvent, SimplePool } from 'nostr-tools';
import { GitProvider, IsomorphicGitProvider } from '@nostr-git/git-wrapper';
import { rootDir } from '../git.js';
import { Buffer } from 'buffer';
import { isRepoCloned } from '../git.js';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as any).Buffer = Buffer;
}

// Track cloned repositories to avoid duplicate work
const clonedRepos = new Set<string>();

const git: GitProvider = new IsomorphicGitProvider({
  fs: new LightningFS('nostr-git'),
  http: http,
  corsProxy: 'https://cors.isomorphic-git.org',
});

const clone = async ({
  repoId,
  cloneUrls,
}: {
  repoId: string;
  cloneUrls: string[];
}) => {
  // Check if already cloned
  if (clonedRepos.has(repoId)) {
    console.log(`Repository ${repoId} already cloned, skipping...`);
    return { success: true, repoId, cached: true };
  }
  if(await isRepoCloned(`${rootDir}/${repoId}`)) {
    clonedRepos.add(repoId);
    console.log(`Repository ${repoId} already cloned, skipping...`);
    return { success: true, repoId, cached: true };
  }
  const dir = `${rootDir}/${repoId}`;
  const cloneUrl = cloneUrls.find((url) => url.startsWith("https://"));
  if (!cloneUrl) return { success: false, repoId, error: 'No HTTPS clone URL found' };
  
  console.log(`Cloning repository ${repoId} from ${cloneUrl}...`);
  
  // Send progress updates to main thread
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

  sendProgress('Starting clone...');
  
  await git.clone({
    dir,
    url: cloneUrl,
    singleBranch: true,
    noCheckout: true,
    noTags: true,
    depth: 1,
    onProgress: (progress: { phase: string; loaded?: number; total?: number }) => {
      sendProgress(progress.phase, progress.loaded, progress.total);
    }
  });
  
  sendProgress('Clone completed');
  
  // Mark as cloned
  clonedRepos.add(repoId);
  console.log(`Repository ${repoId} cloned successfully`);
  
  return { success: true, repoId, cached: false };
}

const clearCloneCache = () => {
  clonedRepos.clear();
  console.log('Clone cache cleared');
  return { success: true, cleared: clonedRepos.size === 0 };
}

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

expose({ cloneAndFork, clone, clearCloneCache });
