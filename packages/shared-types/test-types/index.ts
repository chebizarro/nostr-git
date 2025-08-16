// Type-only compile check for shared-types public API
import {
  type RepoAnnouncementEvent,
  type RepoStateEvent,
  type PatchEvent,
  type IssueEvent,
  type StatusEvent,
  getTag,
  getTags,
  getTagValue,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  parsePatchEvent,
  parseIssueEvent,
  parseStatusEvent,
  createRepoAnnouncementEvent,
  createRepoStateEvent,
  createPatchEvent,
  createIssueEvent,
  createStatusEvent,
} from "@nostr-git/shared-types";

// Dummy events to satisfy types
const rae = { kind: 30617, tags: [["d", "name"]], content: "", pubkey: "", created_at: 0, id: "" } as unknown as RepoAnnouncementEvent;
const rse = { kind: 30618, tags: [["d", "name"]], content: "", pubkey: "", created_at: 0, id: "" } as unknown as RepoStateEvent;
const pe = { kind: 1617, tags: [["a", "addr"]], content: "diff" } as unknown as PatchEvent;
const ie = { kind: 1621, tags: [["a", "addr"]], content: "issue" } as unknown as IssueEvent;
const se = { kind: 1630, tags: [["e", "id", "", "root"]], content: "status" } as unknown as StatusEvent;

// Use tag helpers
getTag(rae, "d");
getTags(rae, "t");
getTagValue(rae, "name");

// Use parsers
parseRepoAnnouncementEvent(rae);
parseRepoStateEvent(rse);
parsePatchEvent(pe);
parseIssueEvent(ie);
parseStatusEvent(se);

// Use creators
createRepoAnnouncementEvent({ repoId: "owner/repo" });
createRepoStateEvent({ repoId: "owner/repo" });
createPatchEvent({ content: "diff", repoAddr: "30617:pub:d" });
createIssueEvent({ content: "issue", repoAddr: "30617:pub:d" });
createStatusEvent({ kind: 1630, content: "status", rootId: "e-id" });
