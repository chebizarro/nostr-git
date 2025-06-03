import { Patch, PatchEvent, Profile } from "@nostr-git/shared-types";
import { parseGitPatch } from "parse-patch";
import parseGitDiff from "parse-git-diff";

export function parseGitPatchFromEvent(event: PatchEvent): Patch {
  const header = parseGitPatch(event.content);

  const commits = header.map((commit) => {
    return {
      oid: commit.sha,
      message: commit.message,
      author: { name: commit.authorName, email: commit.authorEmail },
    };
  });

  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1];
  const getAllTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);
  const authorTag = event.tags.find(t => t[0] === "committer");
  const author: Profile = {
    pubkey: event.pubkey,
    name: authorTag?.[1],
  };
  const gitDiff = parseGitDiff(header[0].diff);
  const diff = gitDiff["files"];
  let status: "open" | "merged" | "closed" = "open";
  if (event.tags.some(t => t[0] === "t" && t[1] === "merged")) status = "merged";
  else if (event.tags.some(t => t[0] === "t" && t[1] === "closed")) status = "closed";

  return {
    id: event.id,
    repoId: getTag("a") || "",
    title: getTag("subject") || header[0].message,
    description: header[0].message,
    author,
    baseBranch: getTag("base-branch") || "",
    commitCount: header.length,
    commentCount: getAllTags("e").length,
    createdAt: new Date(event.created_at * 1000).toISOString(),
    status,
    raw: event,
    diff,
    commits,
  };
}
