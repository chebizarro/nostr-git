import { getGitProvider } from './git-provider.js';
import { ensureRepo, ensureRepoFromEvent, rootDir } from './git.js';
import { parseRepoAnnouncementEvent, type RepoAnnouncementEvent } from '@nostr-git/shared-types';
import { Buffer } from 'buffer';

if (typeof window.Buffer === 'undefined') {
  (window as any).Buffer = Buffer;
}

/**
 * Represents a file or directory in a Git repository.
 */
export interface FileEntry {
  /**
   * The name of the file or directory.
   */
  name: string;
  /**
   * The path of the file or directory.
   */
  path: string;
  /**
   * The type of the file or directory.
   */
  type: 'file' | 'directory' | 'submodule' | 'symlink';
  /**
   * The object ID of the file or directory, if applicable.
   */
  oid?: string;
}

/**
 * List files and directories in a repo at a given path and branch/commit.
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.branch, opts.commit, opts.path - (optional) overrides
 * @returns FileEntry[]
 *
 * @example
 * const files = await listRepoFilesFromEvent({ repoEvent: parsed, branch: 'main' });
 */
export async function listRepoFilesFromEvent(opts: {
  repoEvent: RepoAnnouncementEvent;
  branch?: string;
  commit?: string;
  path?: string;
}): Promise<FileEntry[]> {
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main';
  const dir = `${rootDir}/${opts.repoEvent.id}`;
  await ensureRepoFromEvent({ repoEvent: event, branch });

  const git = getGitProvider();
  let oid: string;
  if (opts.commit) {
    oid = opts.commit;
    try {
      await git.readCommit({ dir, oid });
    } catch (error: any) {
      // Try to get more information about available commits
      try {
        const commits = await git.log({ dir, depth: 10 });
        const availableCommits = commits.map((c: any) => c.oid.substring(0, 8)).join(', ');
        throw new Error(`Commit ${opts.commit} not found in repository. Available recent commits: ${availableCommits}`);
      } catch (logError) {
        throw new Error(`Commit ${opts.commit} not found in repository. Unable to list available commits.`);
      }
    }
  } else {
    oid = await git.resolveRef({ dir, ref: branch });
  }
  const treePath = opts.path || '';
  const { tree } = await git.readTree({ dir, oid, filepath: treePath });
  return tree.map((entry: any) => ({
    name: entry.path,
    path: treePath ? `${treePath}/${entry.path}` : entry.path,
    type: entry.type === 'blob' ? 'file' : entry.type === 'tree' ? 'directory' : entry.type === 'commit' ? 'submodule' : 'file',
    oid: entry.oid,
  }));
}

/**
 * Get the contents of a file in a repo by name/path using a RepoAnnouncementEvent (NIP-34).
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.branch - branch name (optional)
 * @param opts.commit - specific commit hash (optional, takes precedence over branch)
 * @param opts.path - file path (required)
 * @returns file content as utf-8 string
 */
export async function getRepoFileContentFromEvent(opts: {
  repoEvent: RepoAnnouncementEvent;
  branch?: string;
  commit?: string;
  path: string;
}): Promise<string> {
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main';
  const dir = `${rootDir}/${opts.repoEvent.id}`;
  await ensureRepoFromEvent({ repoEvent: event, branch });
  
  const git = getGitProvider();
  let oid: string;
  
  if (opts.commit) {
    oid = opts.commit;
    try {
      await git.readCommit({ dir, oid });
    } catch (error: any) {
      // Try to get more information about available commits
      try {
        const commits = await git.log({ dir, depth: 10 });
        const availableCommits = commits.map((c: any) => c.oid.substring(0, 8)).join(', ');
        throw new Error(`Commit ${opts.commit} not found in repository. Available recent commits: ${availableCommits}`);
      } catch (logError) {
        throw new Error(`Commit ${opts.commit} not found in repository. Unable to list available commits.`);
      }
    }
  } else {
    oid = await git.resolveRef({ dir, ref: branch });
  }
  
  try {
    const { blob } = await git.readBlob({ dir, oid, filepath: opts.path });
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(blob);
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      throw new Error(`File '${opts.path}' not found at ${opts.commit ? `commit ${opts.commit}` : `branch ${branch}`}`);
    }
    throw error;
  }
}

/**
 * Get the contents of a file in a repo by name/path using classic host/owner/repo.
 * @param opts.host, opts.owner, opts.repo - repo location
 * @param opts.branch - branch name (optional)
 * @param opts.path - file path (required)
 * @returns file content as utf-8 string
 */
export async function getRepoFileContent(opts: {
  host: string;
  owner: string;
  repo: string;
  branch?: string;
  path: string;
}): Promise<string> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const branch = opts.branch || 'main';
  await ensureRepo({ host: opts.host, owner: opts.owner, repo: opts.repo, branch });
  const git = getGitProvider();
  const oid = await git.resolveRef({ dir, ref: branch });
  const { blob } = await git.readBlob({ dir, oid, filepath: opts.path });
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(blob);
}

export async function listRepoFiles(opts: {
  host: string;
  owner: string;
  repo: string;
  branch?: string;
  commit?: string;
  path?: string;
}): Promise<FileEntry[]> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const branch = opts.branch || 'main';
  await ensureRepo({ host: opts.host, owner: opts.owner, repo: opts.repo, branch });
  const git = getGitProvider();
  let oid: string;
  if (opts.commit) {
    oid = opts.commit;
  } else {
    oid = await git.resolveRef({ dir, ref: branch });
  }
  const treePath = opts.path || '';
  const { tree } = await git.readTree({ dir, oid, filepath: treePath });
  return tree.map((entry: any) => ({
    name: entry.path,
    path: treePath ? `${treePath}/${entry.path}` : entry.path,
    type: entry.type === 'blob' ? 'file' : entry.type === 'tree' ? 'dir' : entry.type === 'commit' ? 'submodule' : 'file',
    oid: entry.oid,
    // size can be fetched with readBlob if needed
  }));
}

/**
 * Check if a file exists at a specific commit or branch
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.branch - branch name (optional)
 * @param opts.commit - specific commit hash (optional, takes precedence over branch)
 * @param opts.path - file path (required)
 * @returns boolean indicating if file exists
 */
export async function fileExistsAtCommit(opts: {
  repoEvent: RepoAnnouncementEvent;
  branch?: string;
  commit?: string;
  path: string;
}): Promise<boolean> {
  try {
    await getRepoFileContentFromEvent(opts);
    return true;
  } catch (error: any) {
    return false;
  }
}

/**
 * Get commit information for a specific commit hash
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.commit - commit hash
 * @returns commit object with author, message, etc.
 */
export async function getCommitInfo(opts: {
  repoEvent: RepoAnnouncementEvent;
  commit: string;
}): Promise<{
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  committer: { name: string; email: string; timestamp: number };
  parent: string[];
}> {
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const dir = `${rootDir}/${opts.repoEvent.id}`;
  await ensureRepoFromEvent({ repoEvent: event, branch: 'main' });
  
  const git = getGitProvider();
  const commit = await git.readCommit({ dir, oid: opts.commit });
  
  return {
    oid: commit.oid,
    message: commit.commit.message,
    author: commit.commit.author,
    committer: commit.commit.committer,
    parent: commit.commit.parent,
  };
}

/**
 * Get file history - list of commits that modified a specific file
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.path - file path (required)
 * @param opts.branch - branch to search (optional, defaults to main)
 * @param opts.maxCount - maximum number of commits to return (optional, defaults to 50)
 * @returns array of commit objects that modified the file
 */
export async function getFileHistory(opts: {
  repoEvent: RepoAnnouncementEvent;
  path: string;
  branch?: string;
  maxCount?: number;
}): Promise<Array<{
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  committer: { name: string; email: string; timestamp: number };
}>> {
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main';
  const dir = `${rootDir}/${opts.repoEvent.id}`;
  await ensureRepoFromEvent({ repoEvent: event, branch });
  
  const git = getGitProvider();
  const commits = await git.log({
    dir,
    ref: branch,
    filepath: opts.path,
    depth: opts.maxCount || 50,
  });
  
  return commits.map((commit: any) => ({
    oid: commit.oid,
    message: commit.commit.message,
    author: commit.commit.author,
    committer: commit.commit.committer,
  }));
}
