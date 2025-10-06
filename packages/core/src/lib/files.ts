import { getGitProvider } from './git-provider.js';
import {
  ensureRepo,
  ensureRepoFromEvent,
  rootDir,
  getDefaultBranch,
  resolveRobustBranch
} from './git.js';
import { canonicalRepoKey } from './utils/canonicalRepoKey.js';
import { parseRepoAnnouncementEvent, type RepoAnnouncementEvent } from '@nostr-git/shared-types';
import { Buffer } from 'buffer';
import { assertRepoAnnouncementEvent } from './validation.js';

declare global {
  // Extend globalThis to include Buffer
  // eslint-disable-next-line no-var
  // Use 'any' to avoid circular reference error
  var Buffer: any;
}

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
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
  // Optional, when caller already computed canonical repo key (e.g. "owner/name" or "owner:name")
  repoKey?: string;
}): Promise<FileEntry[]> {
  assertRepoAnnouncementEvent(opts.repoEvent);
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main'; // Will be resolved robustly later
  const dir = `${rootDir}/${opts.repoKey || canonicalRepoKey(event.repoId)}`;

  // Ensure adequate repository depth for file operations
  // If accessing a specific commit, we need more than shallow clone
  const requiredDepth = opts.commit ? 100 : 10; // More depth if accessing specific commit
  await ensureRepoFromEvent({ repoEvent: event, branch, repoKey: opts.repoKey }, requiredDepth);

  const git = getGitProvider();
  let oid: string;

  if (opts.commit) {
    oid = opts.commit;
    try {
      await git.readCommit({ dir, oid });
    } catch (error: any) {
      // If commit not found, try to deepen the repository
      if (error.name === 'NotFoundError') {
        console.warn(`Commit ${opts.commit} not found, attempting to deepen repository...`);
        try {
          // Try with much deeper history
          await ensureRepoFromEvent({ repoEvent: event, branch, repoKey: opts.repoKey }, 500);
          // Retry reading the commit
          await git.readCommit({ dir, oid });
        } catch (deepenError: any) {
          // As a next attempt, fetch tags and recent history from remote (commit may be reachable via tag only)
          try {
            const selectCloneUrl = () => {
              let url = event.clone?.find((u: string) => u.startsWith('https://'));
              if (!url && event.clone?.length) {
                const ssh = event.clone.find((u: string) => u.startsWith('git@'));
                if (ssh) {
                  const m = ssh.match(/^git@([^:]+):(.+?)(\.git)?$/);
                  if (m) url = `https://${m[1]}/${m[2]}.git`;
                }
              }
              return url;
            };
            const url = selectCloneUrl();
            if (url) {
              // Fetch tags and a bit more history to try to obtain the commit
              await git.fetch({
                dir,
                url,
                singleBranch: false,
                depth: 200,
                tags: true
              });
              // Retry reading commit after tag fetch
              await git.readCommit({ dir, oid });
            } else {
              throw deepenError;
            }
          } catch (fetchTagsError: any) {
            // Final diagnostic: list some commits for error context
            try {
              const commits = await git.log({ dir, depth: 10 });
              const availableCommits = commits.map((c: any) => c.oid.substring(0, 8)).join(', ');
              throw new Error(
                `Commit ${opts.commit} not found in repository. Available recent commits: ${availableCommits}`
              );
            } catch (logError) {
              throw new Error(
                `Commit ${opts.commit} not found in repository. Unable to list available commits.`
              );
            }
          }
        }
      } else {
        throw error;
      }
    }
  } else {
    // Prefer a full OID for subsequent tree/blob reads
    try {
      oid = await git.resolveRef({ dir, ref: branch });
    } catch (e) {
      // Fallback to robust resolver if direct ref resolution fails
      oid = await resolveRobustBranch(git, dir, branch, {
        onBranchNotFound: (branchName, error) => {
          throw error;
        }
      });
    }
  }

  // Normalize file path - remove leading/trailing directory separators
  const rawPath = opts.path || '';
  const treePath = rawPath.replace(/^\/+|\/+$/g, ''); // Remove leading/trailing slashes
  const displayPath = treePath || '(root)';

  try {
    const fp: any = treePath ? treePath : undefined;
    const { tree } = await git.readTree({ dir, oid, filepath: fp });
    return tree.map((entry: any) => ({
      name: entry.path,
      path: treePath ? `${treePath}/${entry.path}` : entry.path,
      type:
        entry.type === 'blob'
          ? 'file'
          : entry.type === 'tree'
            ? 'directory'
            : entry.type === 'commit'
              ? 'submodule'
              : 'file',
      oid: entry.oid
    }));
  } catch (error: any) {
    const original = error;
    let attempts = 0;
    const attemptReadTree = async (depthHint: number) => {
      // Deepen repo and retry
      await ensureRepoFromEvent({ repoEvent: event, branch, repoKey: opts.repoKey }, depthHint);
      const fp: any = treePath ? treePath : undefined;
      const { tree } = await git.readTree({ dir, oid, filepath: fp });
      return tree.map((entry: any) => ({
        name: entry.path,
        path: treePath ? `${treePath}/${entry.path}` : entry.path,
        type:
          entry.type === 'blob'
            ? 'file'
            : entry.type === 'tree'
              ? 'directory'
              : entry.type === 'commit'
                ? 'submodule'
                : 'file',
        oid: entry.oid
      }));
    };

    try {
      // First recovery path for missing subtrees
      console.warn(`Tree read failed for ${oid} at '${displayPath}' (${original?.name || original}). Deepening and retrying...`);
      attempts += 1;
      return await attemptReadTree(1000);
    } catch (retry1: any) {
      try {
        // Second recovery path: fetch tags and more history, then retry again
        const selectCloneUrl = () => {
          let url = event.clone?.find((u: string) => u.startsWith('https://'));
          if (!url && event.clone?.length) {
            const ssh = event.clone.find((u: string) => u.startsWith('git@'));
            if (ssh) {
              const m = ssh.match(/^git@([^:]+):(.+?)(\.git)?$/);
              if (m) url = `https://${m[1]}/${m[2]}.git`;
            }
          }
          return url;
        };
        const url = selectCloneUrl();
        if (url) {
          // Prefer fetching the exact branch with full history to ensure the root tree exists
          try {
            await git.fetch({ dir, url, singleBranch: true, depth: 0, ref: branch, tags: true });
          } catch (fetchErr) {
            // Fallback to a limited-depth, multi-branch fetch if full fetch fails
            try {
              await git.fetch({ dir, url, singleBranch: false, depth: 500, tags: true });
            } catch (fetchTagsError) {
              // Final diagnostic: list some commits for error context
              try {
                const commits = await git.log({ dir, depth: 10 });
                const availableCommits = commits.map((c: any) => c.oid.substring(0, 8)).join(', ');
                throw new Error(
                  `Commit ${opts.commit} not found in repository. Available recent commits: ${availableCommits}`
                );
              } catch (logError) {
                throw new Error(
                  `Commit ${opts.commit} not found in repository. Unable to list available commits.`
                );
              }
            }
          }
        }
        return await attemptReadTree(1500);
      } catch (retry2: any) {
        const context = `commit=${oid?.slice?.(0, 8) || 'unknown'} branch=${branch}`;
        const attemptsText = attempts > 0 ? `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}` : 'retries';
        throw new Error(
          `Unable to access file tree at ${displayPath} after ${attemptsText}. ${context}. Original error: ${original?.message || String(original)}`
        );
      }
    }
  }
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
  repoKey?: string;
}): Promise<string> {
  assertRepoAnnouncementEvent(opts.repoEvent);
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main'; // Will be resolved robustly in git operations
  const dir = `${rootDir}/${opts.repoKey || canonicalRepoKey(event.repoId)}`;

  // Ensure adequate repository depth for file operations
  // If accessing a specific commit, we need more than shallow clone
  const requiredDepth = opts.commit ? 100 : 10; // More depth if accessing specific commit
  await ensureRepoFromEvent({ repoEvent: event, branch, repoKey: opts.repoKey }, requiredDepth);

  const git = getGitProvider();
  let oid: string;

  if (opts.commit) {
    oid = opts.commit;
    try {
      await git.readCommit({ dir, oid });
    } catch (error: any) {
      // If commit not found, try to deepen the repository
      if (error.name === 'NotFoundError') {
        console.warn(`Commit ${opts.commit} not found, attempting to deepen repository...`);
        try {
          // Try with much deeper history
          await ensureRepoFromEvent({ repoEvent: event, branch, repoKey: opts.repoKey }, 500);
          // Retry reading the commit
          await git.readCommit({ dir, oid });
        } catch (deepenError: any) {
          // Try to get more information about available commits
          try {
            const commits = await git.log({ dir, depth: 10 });
            const availableCommits = commits.map((c: any) => c.oid.substring(0, 8)).join(', ');
            throw new Error(
              `Commit ${opts.commit} not found in repository. Available recent commits: ${availableCommits}`
            );
          } catch (logError) {
            throw new Error(
              `Commit ${opts.commit} not found in repository. Unable to list available commits.`
            );
          }
        }
      } else {
        throw error;
      }
    }
  } else {
    oid = await resolveRobustBranch(git, dir, branch, {
      onBranchNotFound: (branchName, error) => {
        // This will be handled by the UI layer if they provide a callback
        console.warn(
          `Branch '${branchName}' from repository state not found in local git:`,
          error.message
        );
      }
    });
  }

  try {
    const { blob } = await git.readBlob({ dir, oid, filepath: opts.path });
    // Return raw binary data as string to preserve binary files (images, PDFs, etc.)
    // The UI layer will handle text vs binary detection and appropriate decoding
    return Array.from(new Uint8Array(blob))
      .map((byte) => String.fromCharCode(byte))
      .join('');
  } catch (error: any) {
    if (error.name === 'NotFoundError') {
      // If file not found, try to deepen repository and retry
      console.warn(`File '${opts.path}' not found, attempting to deepen repository...`);
      try {
        await ensureRepoFromEvent(
          { repoEvent: event, branch: opts.branch, repoKey: opts.repoKey },
          1000
        );
        const { blob } = await git.readBlob({ dir, oid, filepath: opts.path });
        // Return raw binary data as string to preserve binary files
        return Array.from(new Uint8Array(blob))
          .map((byte) => String.fromCharCode(byte))
          .join('');
      } catch (retryError: any) {
        if (retryError.name === 'NotFoundError') {
          throw new Error(
            `File '${opts.path}' not found at ${opts.commit ? `commit ${opts.commit}` : `branch ${branch}`}`
          );
        }
        throw retryError;
      }
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
    type:
      entry.type === 'blob'
        ? 'file'
        : entry.type === 'tree'
          ? 'dir'
          : entry.type === 'commit'
            ? 'submodule'
            : 'file',
    oid: entry.oid
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
  repoKey?: string;
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
  assertRepoAnnouncementEvent(opts.repoEvent);
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const dir = `${rootDir}/${canonicalRepoKey(event.repoId)}`;
  await ensureRepoFromEvent({ repoEvent: event });

  const git = getGitProvider();
  const commit = await git.readCommit({ dir, oid: opts.commit });

  return {
    oid: commit.oid,
    message: commit.commit.message,
    author: commit.commit.author,
    committer: commit.commit.committer,
    parent: commit.commit.parent
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
  repoKey?: string;
}): Promise<
  Array<{
    oid: string;
    message: string;
    author: { name: string; email: string; timestamp: number };
    committer: { name: string; email: string; timestamp: number };
  }>
> {
  assertRepoAnnouncementEvent(opts.repoEvent);
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main'; // Will be resolved robustly in git operations
  const dir = `${rootDir}/${opts.repoKey || canonicalRepoKey(event.repoId)}`;
  await ensureRepoFromEvent({ repoEvent: event, branch: opts.branch, repoKey: opts.repoKey });

  const git = getGitProvider();
  const commits = await git.log({
    dir,
    ref: branch,
    filepath: opts.path,
    depth: opts.maxCount || 50
  });

  return commits.map((commit: any) => ({
    oid: commit.oid,
    message: commit.commit.message,
    author: commit.commit.author,
    committer: commit.commit.committer
  }));
}

/**
 * Get commit history for a branch
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.branch - branch to get history for (optional, defaults to main)
 * @param opts.depth - maximum number of commits to return (optional, defaults to 50)
 * @returns array of commit objects with full details
 */
export async function getCommitHistory(opts: {
  repoEvent: RepoAnnouncementEvent;
  branch?: string;
  depth?: number;
}): Promise<
  Array<{
    oid: string;
    commit: {
      message: string;
      author: { name: string; email: string; timestamp: number };
      committer: { name: string; email: string; timestamp: number };
      parent: string[];
    };
  }>
> {
  assertRepoAnnouncementEvent(opts.repoEvent);
  const event = parseRepoAnnouncementEvent(opts.repoEvent);
  const branch = opts.branch || 'main'; // Will be resolved robustly in git operations
  const dir = `${rootDir}/${canonicalRepoKey(event.repoId)}`;
  const depth = opts.depth || 50;

  console.log(`getCommitHistory: requesting ${depth} commits for branch ${branch}`);
  await ensureRepoFromEvent({ repoEvent: event, branch }, depth);

  const git = getGitProvider();
  const commits = await git.log({
    dir,
    ref: branch,
    depth
  });
  console.log(`getCommitHistory: got ${commits.length} commits from git.log`);
  return commits.map((commit: any) => ({
    oid: commit.oid,
    commit: {
      message: commit.commit.message,
      author: commit.commit.author,
      committer: commit.commit.committer,
      parent: commit.commit.parent
    }
  }));
}
