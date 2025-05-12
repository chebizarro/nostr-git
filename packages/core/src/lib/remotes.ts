// Remote-related git functions for @nostr-git/core
import { getGitProvider } from './git-provider.js';
import LightningFS from '@isomorphic-git/lightning-fs';
import { rootDir } from './git.js';

const fs: any = new LightningFS('nostr-git');

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
  await git.fetch({ fs, dir, remote: opts.remote, ref: opts.ref });
}

/**
 * Push to a remote.
 */
export async function pushRemote(opts: { owner: string; repo: string; remote?: string; ref?: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.push({ fs, dir, remote: opts.remote, ref: opts.ref });
}

/**
 * Pull from a remote.
 */
export async function pullRemote(opts: { owner: string; repo: string; remote?: string; ref?: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.pull({ fs, dir, remote: opts.remote, ref: opts.ref });
}

// TODO: Add functions for listing, adding, removing, and updating remotes as needed
