// Status and diff-related git functions for @nostr-git/core
import { getGitProvider } from './git-provider.js';
import { rootDir } from './git.js';

export interface FileChange {
  filepath: string;
  type: 'add' | 'remove' | 'modify';
  Aoid?: string;
  Boid?: string;
}

/**
 * Get the status matrix for a repo.
 */
export async function statusMatrix(opts: { owner: string; repo: string; }): Promise<any[]> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  return git.statusMatrix({ dir });
}

/**
 * Get file changes between two commits.
 */
export async function getFileChanges(opts: { owner: string; repo: string; oldOid: string; newOid: string }): Promise<FileChange[]> {
  const dir = `${rootDir}/${opts.owner}/${opts.repo}`;
  const git = getGitProvider();
  const results = await git.walk({
    dir,
    trees: [git.TREE({ ref: opts.oldOid }), git.TREE({ ref: opts.newOid })],
    map: async (filepath: string, [A, B]: [any, any]) => {
      if (filepath === '.') return;
      const Atype = await A?.type();
      const Btype = await B?.type();
      if (Atype === 'tree' || Btype === 'tree') return;
      const Aoid = await A?.oid();
      const Boid = await B?.oid();
      if (Aoid === Boid) return;
      let type: 'add' | 'remove' | 'modify' = 'modify';
      if (Aoid === undefined) type = 'add';
      if (Boid === undefined) type = 'remove';
      return { filepath, type, Aoid, Boid };
    },
  });
  return results.filter(Boolean);
}

// TODO: Add diff/patch generation and other status helpers as needed
