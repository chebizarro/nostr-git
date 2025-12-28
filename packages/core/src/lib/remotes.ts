// Remote-related git functions for @nostr-git/core
import { getGitProvider } from './git-provider.js';
import { rootDir } from './git.js';

/**
 * Fetch from a remote.
 */
export async function fetchRemote(opts: {
  owner: string;
  repo: string;
  remote?: string;
  ref?: string;
}): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();

  // Get remote URL to avoid "remote OR url" error
  const remotes = await git.listRemotes({ dir });
  const remoteName = opts.remote || 'origin';
  const remoteInfo = remotes.find((r: any) => r.remote === remoteName);

  if (!remoteInfo || !remoteInfo.url) {
    throw new Error(`Remote '${remoteName}' not found or has no URL configured`);
  }

  await git.fetch({ dir, url: remoteInfo.url, ref: opts.ref });
}

/**
 * Push to a remote.
 */
export async function pushRemote(opts: {
  owner: string;
  repo: string;
  remote?: string;
  ref?: string;
}): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();

  // Get remote URL to avoid "remote OR url" error
  const remotes = await git.listRemotes({ dir });
  const remoteName = opts.remote || 'origin';
  const remoteInfo = remotes.find((r: any) => r.remote === remoteName);

  if (!remoteInfo || !remoteInfo.url) {
    throw new Error(`Remote '${remoteName}' not found or has no URL configured`);
  }

  await git.push({ dir, url: remoteInfo.url, ref: opts.ref });
}

/**
 * Pull from a remote.
 */
export async function pullRemote(opts: {
  owner: string;
  repo: string;
  remote?: string;
  ref?: string;
}): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.pull({ dir, remote: opts.remote, ref: opts.ref });
}

// TODO: Add functions for listing, adding, removing, and updating remotes as needed
