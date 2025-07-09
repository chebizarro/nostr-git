import { Patch, PatchEvent, Profile } from '@nostr-git/shared-types';
import { parseGitPatch } from 'parse-patch';
import parseDiff from 'parse-diff';
import { getGitProvider } from './git-provider.js';
import { rootDir } from './git.js';
import { GitMergeResult } from '@nostr-git/git-wrapper';

export function parseGitPatchFromEvent(event: PatchEvent): Patch {
  const header = parseGitPatch(event.content);

  let diff = parseDiff(event.content);

  const commits = header.map((commit) => {
    return {
      oid: commit.sha,
      message: commit.message,
      author: { name: commit.authorName, email: commit.authorEmail }
    };
  });

  const getTag = (name: string) => event.tags.find((t) => t[0] === name)?.[1];
  const authorTag = event.tags.find((t) => t[0] === 'committer');
  const author: Profile = {
    pubkey: event.pubkey,
    name: authorTag?.[1]
  };

  return {
    id: event.id,
    repoId: getTag('a') || '',
    title: getTag('subject') || header.length > 0 ? header[0].message : '',
    description: header.length > 0 ? header[0].message : '',
    author,
    baseBranch: getTag('base-branch') || '',
    commitCount: header.length,
    commitHash: getTag('commit') || '',
    createdAt: new Date(event.created_at * 1000).toISOString(),
    status: 'open',
    raw: event,
    diff,
    commits
  };
}

export async function applyPatchSet(patchSet: Patch[]) {
  if (!patchSet.length) throw new Error('empty patch set');
}

export async function mergePatchSet(
  dir: string,
  targetBranch: string,
  incomingBranch: string
): Promise<GitMergeResult> {
  const git = getGitProvider();

  await git.checkout({ dir, ref: targetBranch });

  const result = await git.merge({
    dir,
    ours: targetBranch,
    theirs: incomingBranch,
    fastForward: false,
    abortOnConflict: true
  });

  return result;
}
