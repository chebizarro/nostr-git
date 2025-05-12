import { getGitProvider } from './git-provider.js';
import { ensureRepo, rootDir } from './git.js';
import LightningFS from '@isomorphic-git/lightning-fs';
import type { RepoAnnouncementEvent } from '@nostr-git/shared-types';

const fs: any = new LightningFS('nostr-git');

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'submodule' | 'symlink';
  size?: number;
  oid?: string;
}

/**
 * List files and directories in a repo at a given path and branch/commit.
 * @param opts.repoEvent - RepoAnnouncementEvent (from shared-types)
 * @param opts.branch, opts.commit, opts.path - (optional) overrides
 * @returns FileEntry[]
 *
 * @example
 * import { parseRepoAnnouncementEvent } from '@nostr-git/shared-types';
 * const parsed = parseRepoAnnouncementEvent(rawEvent);
 * const files = await listRepoFilesFromEvent({ repoEvent: parsed, branch: 'main' });
 */
export async function listRepoFilesFromEvent(opts: {
  repoEvent: RepoAnnouncementEvent;
  branch?: string;
  commit?: string;
  path?: string;
}): Promise<FileEntry[]> {
  const { repoId: repo, owner, host } = opts.repoEvent;
  return listRepoFiles({
    host,
    owner,
    repo,
    branch: opts.branch,
    commit: opts.commit,
    path: opts.path,
  });
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
    oid = await git.resolveRef({ fs, dir, ref: branch });
  }
  const treePath = opts.path || '';
  const { tree } = await git.readTree({ fs, dir, oid, filepath: treePath });
  return tree.map((entry: any) => ({
    name: entry.path,
    path: treePath ? `${treePath}/${entry.path}` : entry.path,
    type: entry.type === 'blob' ? 'file' : entry.type === 'tree' ? 'dir' : entry.type === 'commit' ? 'submodule' : 'file',
    oid: entry.oid,
    // size can be fetched with readBlob if needed
  }));
}
