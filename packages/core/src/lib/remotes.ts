// Remote-related git functions for @nostr-git/core
import { getGitProvider } from './git-provider.js';
import { rootDir } from './git.js';

export interface Remote {
  name: string;
  url: string;
}

/**
 * Fetch from a remote.
 */
export async function fetchRemote(opts: { owner: string; repo: string; remote?: string; ref?: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.fetch({ dir, remote: opts.remote, ref: opts.ref });
}

/**
 * Push to a remote.
 */
export async function pushRemote(opts: { owner: string; repo: string; remote?: string; ref?: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.push({ dir, remote: opts.remote, ref: opts.ref });
}

/**
 * Pull from a remote.
 */
export async function pullRemote(opts: { owner: string; repo: string; remote?: string; ref?: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.pull({ dir, remote: opts.remote, ref: opts.ref });
}

// TODO: Add functions for listing, adding, removing, and updating remotes as needed
