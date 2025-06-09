import { getGitProvider } from './git-provider.js';
import { rootDir } from './git.js';
import { parseRepoAnnouncementEvent, RepoAnnouncementEvent } from '@nostr-git/shared-types';

export interface Branch {
  name: string;
  oid?: string; // commit hash
  isHead: boolean;
}

export async function listBranchesFromEvent(opts: { repoEvent: RepoAnnouncementEvent; }): Promise<Branch[]> {
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const dir = `${rootDir}/${opts.repoEvent.id}`;
  const git = getGitProvider();
  const branches = await git.listBranches({dir});
  return branches.map((name: string) => ({ name }));
}

/**
 * List all branches in a repo.
 */
export async function listBranches(opts: { url: string; dir: string; }): Promise<Branch[]> {
  const git = getGitProvider();
  const branches = await git.listBranches({dir: opts.dir, url: opts.url });
  return branches.map((name: string) => ({ name }));
}

/**
 * Create a new branch.
 */
export async function createBranch(opts: { owner: string; repo: string; branch: string; checkout?: boolean; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.branch({ dir, ref: opts.branch, checkout: opts.checkout });
}

/**
 * Delete a branch.
 */
export async function deleteBranch(opts: { owner: string; repo: string; branch: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.deleteBranch({ dir, ref: opts.branch });
}

/**
 * Rename a branch.
 */
export async function renameBranch(opts: { owner: string; repo: string; oldBranch: string; newBranch: string; }): Promise<void> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  await git.renameBranch({ dir, oldref: opts.oldBranch, ref: opts.newBranch });
}
