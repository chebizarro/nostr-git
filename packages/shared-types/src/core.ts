// Canonical shared types for nostr-git

/**
 * Canonical Commit type (from core)
 */
export interface Commit {
  oid: string;
  message: string;
  author: { name: string; email: string; timestamp?: number };
  committer?: { name: string; email: string; timestamp?: number };
  parent?: string[];
  tree?: string;
  date?: number;
}

/**
 * FileDiff: describes a single file's diff in a commit or patch
 */
export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  diffHunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    patches: Array<{ line: string; type: '+' | '-' | ' ' }>;
  }>;
}

/**
 * CommitDiff: a commit and its file changes
 */
export interface CommitDiff {
  meta: Commit;
  changes: FileDiff[];
}

/**
 * Patch: describes a patch set (from core/src/lib/patches.ts)
 * This is a draft and may need refinement based on actual usage.
 */
export interface Patch {
  id: string;
  repoId: string;
  title: string;
  description: string;
  author: { pubkey: string; name?: string };
  baseBranch: string;
  commitCount: number;
  commitHash: string;
  createdAt: string;
  status: string;
  raw: any;
  diff: any;
  commits: Commit[];
}
