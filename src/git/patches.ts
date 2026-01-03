import type { Patch } from "@nostr-git/types";
import type { PatchEvent, Profile } from "@nostr-git/events";
import { getTagValue, getTag } from "@nostr-git/events";
import { parseGitPatch } from "parse-patch";
import parseDiff from "parse-diff";
import { getGitProvider } from "../api/git-provider.js";
import type { GitMergeResult } from "@nostr-git/git";

export function parseGitPatchFromEvent(event: PatchEvent): Patch {
  const parsed = parseGitPatch(event.content);
  const header = Array.isArray(parsed) ? parsed : [];

  const diff = parseDiff(event.content);

  const commits = header.map((commit) => {
    return {
      oid: commit.sha,
      message: commit.message,
      author: { name: commit.authorName, email: commit.authorEmail },
    };
  });
  const authorTag = getTag(event as any, "committer");
  const author: Profile = {
    pubkey: event.pubkey,
    name: authorTag?.[1],
  };

  return {
    id: event.id,
    repoId: getTagValue(event as any, "a") || "",
    title: getTagValue(event as any, "subject") || (header[0]?.message ?? ""),
    description: header[0]?.message ?? "",
    author,
    baseBranch: getTagValue(event as any, "base-branch") || "",
    commitCount: header.length,
    commitHash: getTagValue(event as any, "commit") || "",
    createdAt: new Date(event.created_at * 1000).toISOString(),
    status: "open",
    raw: event,
    diff,
    commits,
  };
}

export async function applyPatchSet(patchSet: Patch[]) {
  if (!patchSet.length) throw new Error("empty patch set");
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
    abortOnConflict: true,
  });

  return result;
}