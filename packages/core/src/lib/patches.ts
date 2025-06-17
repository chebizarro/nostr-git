import { Patch, PatchEvent, Profile } from "@nostr-git/shared-types";
import { parseGitPatch } from "parse-patch";
import parseGitDiff, { AnyFileChange } from "parse-git-diff";

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
  let diff: AnyFileChange[] = [];
  if (header.length > 0) {
    const gitDiff = parseGitDiff(header[0].diff);
    diff = gitDiff["files"];
  }

  return {
    id: event.id,
    repoId: getTag("a") || "",
    title: getTag("subject") || header.length > 0 ? header[0].message : "",
    description: header.length > 0 ? header[0].message : "",
    author,
    baseBranch: getTag("base-branch") || "",
    commitCount: header.length,
    commentCount: getAllTags("e").length,
    createdAt: new Date(event.created_at * 1000).toISOString(),
    status: "open",
    raw: event,
    diff,
    commits,
  };
}
