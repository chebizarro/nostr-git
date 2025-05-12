// Branch-related git functions for @nostr-git/core
import { getGitProvider } from './git-provider.js';
import LightningFS from '@isomorphic-git/lightning-fs';
import { rootDir } from './git.js';

const fs: any = new LightningFS('nostr-git');

export interface Branch {
  name: string;
  oid?: string;
}

/**
 * List all branches in a repo.
 */
export async function listBranches(opts: { owner: string; repo: string; }): Promise<Branch[]> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  const branches = await git.listBranches({ fs, dir });
  return branches.map((name: string) => ({ name }));
}

/**
 * Create a new branch.
 */
export async function createBranch(opts: { owner: string; repo: string; branch: string; checkout?: boolean; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.branch({ fs, dir, ref: opts.branch, checkout: opts.checkout });
}

/**
 * Delete a branch.
 */
export async function deleteBranch(opts: { owner: string; repo: string; branch: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.deleteBranch({ fs, dir, ref: opts.branch });
}

/**
 * Rename a branch.
 */
export async function renameBranch(opts: { owner: string; repo: string; oldBranch: string; newBranch: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.renameBranch({ fs, dir, oldref: opts.oldBranch, ref: opts.newBranch });
}
