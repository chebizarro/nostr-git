import { type Nip34Event, type RepoAnnouncementEvent, type RepoStateEvent, type PatchEvent, type IssueEvent, type StatusEvent, type NostrTag, GIT_REPO_ANNOUNCEMENT } from './nip34.js';
import type { CommentEvent } from './nip22.js';

/**
 * Type guard for RepoAnnouncementEvent (kind: 30617)
 */
export function isRepoAnnouncementEvent(event: Nip34Event): event is RepoAnnouncementEvent {
  return event.kind === 30617;
}

/**
 * Type guard for RepoStateEvent (kind: 30618)
 */
export function isRepoStateEvent(event: Nip34Event): event is RepoStateEvent {
  return event.kind === 30618;
}

/**
 * Type guard for PatchEvent (kind: 1617)
 */
export function isPatchEvent(event: Nip34Event): event is PatchEvent {
  return event.kind === 1617;
}

/**
 * Type guard for IssueEvent (kind: 1621)
 */
export function isIssueEvent(event: Nip34Event): event is IssueEvent {
  return event.kind === 1621;
}

/**
 * Type guard for StatusEvent (kinds: 1630, 1631, 1632, 1633)
 */
export function isStatusEvent(event: Nip34Event): event is StatusEvent {
  return event.kind === 1630 || event.kind === 1631 || event.kind === 1632 || event.kind === 1633;
}

/**
 * Get a human-readable label for a NIP-34 or NIP-22 event kind
 */
export function getNostrKindLabel(kind: number): string {
  switch (kind) {
    case 30617:
      return 'Repository Announcement';
    case 30618:
      return 'Repository State';
    case 1617:
      return 'Patch';
    case 1621:
      return 'Issue';
    case 1630:
      return 'Status: Open';
    case 1631:
      return 'Status: Applied/Merged/Resolved';
    case 1632:
      return 'Status: Closed';
    case 1633:
      return 'Status: Draft';
    case 1111:
      return 'Comment';
    default:
      return 'Unknown';
  }
}

/**
 * Type guard for Comment Event (kind: 1111)
 */
export function isCommentEvent(event: { kind: number }): event is CommentEvent {
  return event.kind === 1111;
}


/**
 * Get the first tag of a given type (e.g. 'committer')
 */
export function getTag<T extends string>(event: { tags: NostrTag[] }, tagType: T): Extract<NostrTag, [T, ...string[]]> | undefined {
  return event.tags.find((tag): tag is Extract<NostrTag, [T, ...string[]]> => tag[0] === tagType);
}

/**
 * Get all tags of a given type (e.g. 'p')
 */
export function getTags<T extends string>(event: { tags: NostrTag[] }, tagType: T): Extract<NostrTag, [T, ...string[]]>[] {
  return event.tags.filter((tag): tag is Extract<NostrTag, [T, ...string[]]> => tag[0] === tagType);
}

/**
 * Get the first value (after the tag type) for a given tag type
 */
export function getTagValue<T extends string>(event: { tags: NostrTag[] }, tagType: T): string | undefined {
  const tag = getTag(event, tagType);
  return tag ? tag[1] : undefined;
}

// -------------------
// Event Creation Helpers
// -------------------
import type {
  RepoAnnouncementTag,
  RepoStateTag,
  PatchTag,
  IssueTag,
  StatusTag,
} from './nip34.js';
import { sanitizeRelays } from './sanitize-relays.js';


// Helper: extract repository name from canonical repoId formats
// Accepts formats like:
// - "owner/name"
// - "owner:name"
// - "name"
// Returns just the repository name segment.
function extractRepoName(repoId: string): string {
  // Prefer last segment after '/' first, then after ':'
  if (repoId.includes('/')) {
    const parts = repoId.split('/');
    return parts[parts.length - 1] || repoId;
  }
  if (repoId.includes(':')) {
    const parts = repoId.split(':');
    return parts[parts.length - 1] || repoId;
  }
  return repoId;
}


/**
// export function createCommentEvent(opts: {
//   content: string;
//   tags: CommentTag[];
//   created_at?: number;
//   pubkey?: string;
//   id?: string;
// }): CommentEvent {
//   return {
//     kind: 1111,
//     content: opts.content,
//     tags: opts.tags,
//     created_at: opts.created_at ?? Math.floor(Date.now() / 1000),
//     ...(opts.pubkey ? { pubkey: opts.pubkey } : {}),
//     ...(opts.id ? { id: opts.id } : {}),
//   } as CommentEvent;
// }

/**
 * Create a repo announcement event (kind 30617)
 */
export function createRepoAnnouncementEvent(opts: {
  repoId: string;
  name?: string;
  description?: string;
  web?: string[];
  clone?: string[];
  relays?: string[];
  maintainers?: string[];
  hashtags?: string[];
  earliestUniqueCommit?: string;
  created_at?: number;
}): RepoAnnouncementEvent {
  const tags: RepoAnnouncementTag[] = [
    // NIP-34: use only the repository name for the identifier (d tag)
    ["d", extractRepoName(opts.repoId)],
  ];
  if (opts.name) tags.push(["name", opts.name]);
  if (opts.description) tags.push(["description", opts.description]);
  // NIP-34: web and clone tags can have multiple values, each as separate tag
  if (opts.web) opts.web.forEach(url => tags.push(["web", url]));
  if (opts.clone) opts.clone.forEach(url => tags.push(["clone", url]));
  if (opts.relays) opts.relays.forEach(relay => tags.push(["relays", relay]));
  if (opts.maintainers) opts.maintainers.forEach(maintainer => tags.push(["maintainers", maintainer]));
  if (opts.hashtags) opts.hashtags.forEach(t => tags.push(["t", t]));
  if (opts.earliestUniqueCommit) tags.push(["r", opts.earliestUniqueCommit, "euc"]);
  return {
    kind: 30617,
    content: "",
    tags,
    created_at: opts.created_at ?? Math.floor(Date.now() / 1000),
  } as RepoAnnouncementEvent;
}

/**
 * Create a repo state event (kind 30618) - NIP-34 compliant
 * Repository state events only contain refs and HEAD according to NIP-34
 */
export function createRepoStateEvent(opts: {
  repoId: string;
  refs?: Array<{ type: "heads" | "tags", name: string, commit: string, ancestry?: string[] }>;
  head?: string;
  created_at?: number;
}): RepoStateEvent {
  const tags: RepoStateTag[] = [["d", opts.repoId]];
  
  // Add refs (branches and tags) according to NIP-34
  if (opts.refs) {
    for (const ref of opts.refs) {
      if (ref.ancestry && ref.ancestry.length > 0) {
        // Extended format with ancestry
        tags.push([
          `refs/${ref.type}/${ref.name}`,
          ref.commit,
          ...ref.ancestry
        ]);
      } else {
        // Basic format
        tags.push([`refs/${ref.type}/${ref.name}`, ref.commit]);
      }
    }
  }
  
  // Add HEAD reference according to NIP-34
  if (opts.head) {
    tags.push(["HEAD", `ref: refs/heads/${opts.head}`]);
  }
  
  return {
    kind: 30618,
    tags,
    content: "",
    created_at: opts.created_at ?? Math.floor(Date.now() / 1000),
  } as RepoStateEvent;
}

/**
 * Create a repository state event for a cloned repository
 * This is a simple wrapper around createRepoStateEvent for backward compatibility
 */
export function createClonedRepoStateEvent(
  repoId: string,
  cloneUrl: string,
  branches: string[] = [],
  tags: string[] = [],
  maintainers: string[] = []
): RepoStateEvent {
  // Convert branches and tags to refs format
  const refs = [
    ...branches.map(branch => ({
      type: "heads" as const,
      name: branch,
      commit: "" // Will be filled by the actual implementation
    })),
    ...tags.map(tag => ({
      type: "tags" as const,
      name: tag,
      commit: "" // Will be filled by the actual implementation
    }))
  ];

  return createRepoStateEvent({
    repoId,
    refs,
    head: branches.length > 0 ? branches[0] : undefined
  });
}

/**
 * Create a patch event (kind 1617)
 */
export function createPatchEvent(opts: {
  content: string;
  repoAddr: string;
  earliestUniqueCommit?: string;
  commit?: string;
  parentCommit?: string;
  committer?: { name: string; email: string; timestamp: string; tzOffset: string };
  pgpSig?: string;
  recipients?: string[];
  tags?: PatchTag[];
  created_at?: number;
}): PatchEvent {
  const tags: PatchTag[] = [["a", opts.repoAddr]];
  if (opts.earliestUniqueCommit) tags.push(["r", opts.earliestUniqueCommit]);
  if (opts.commit) tags.push(["commit", opts.commit]);
  if (opts.parentCommit) tags.push(["parent-commit", opts.parentCommit]);
  if (opts.pgpSig) tags.push(["commit-pgp-sig", opts.pgpSig]);
  if (opts.committer) tags.push(["committer", opts.committer.name, opts.committer.email, opts.committer.timestamp, opts.committer.tzOffset]);
  if (opts.recipients) opts.recipients.forEach(p => tags.push(["p", p]));
  if (opts.tags) tags.push(...opts.tags);
  return {
    kind: 1617,
    content: opts.content,
    tags,
    created_at: opts.created_at ?? Math.floor(Date.now() / 1000),
  } as PatchEvent;
}

/**
 * Create an issue event (kind 1621)
 */
export function createIssueEvent(opts: {
  content: string;
  repoAddr: string;
  recipients?: string[];
  subject?: string;
  labels?: string[];
  tags?: IssueTag[];
  created_at?: number;
}): IssueEvent {
  const tags: IssueTag[] = [["a", opts.repoAddr]];
  if (opts.recipients) opts.recipients.forEach(p => tags.push(["p", p]));
  if (opts.subject) tags.push(["subject", opts.subject]);
  if (opts.labels) opts.labels.forEach(l => tags.push(["t", l]));
  if (opts.tags) tags.push(...opts.tags);
  return {
    kind: 1621,
    content: opts.content,
    tags,
    created_at: opts.created_at ?? Math.floor(Date.now() / 1000),
  } as IssueEvent;
}

/**
 * Create a status event (kinds 1630-1633)
 */
export function createStatusEvent(opts: {
  kind: 1630 | 1631 | 1632 | 1633;
  content: string;
  rootId: string;
  replyId?: string;
  recipients?: string[];
  repoAddr?: string;
  relays?: string[];
  appliedCommits?: string[];
  mergedCommit?: string;
  tags?: StatusTag[];
  created_at?: number;
}): StatusEvent {
  const tags: StatusTag[] = [["e", opts.rootId, "", "root"]];
  if (opts.replyId) tags.push(["e", opts.replyId, "", "reply"]);
  if (opts.recipients) opts.recipients.forEach(p => tags.push(["p", p]));
  if (opts.repoAddr) tags.push(["a", opts.repoAddr]);
  if (opts.relays && opts.relays.length) tags.push(["r", opts.relays[0]]);
  if (opts.mergedCommit) tags.push(["merge-commit", opts.mergedCommit]);
  if (opts.appliedCommits) tags.push(["applied-as-commits", opts.appliedCommits[0]]);
  if (opts.tags) tags.push(...opts.tags);
  return {
    kind: opts.kind,
    content: opts.content,
    tags,
    created_at: opts.created_at ?? Math.floor(Date.now() / 1000),
  } as StatusEvent;
}

// -------------------
// Tag Mutation Utilities (immutable)
// -------------------

/**
 * Add a tag (does not replace existing tags of the same type)
 */
export function addTag<E extends { tags: NostrTag[] }>(event: E, tag: NostrTag): E {
  return { ...event, tags: [...event.tags, tag] };
}

/**
 * Set (add or replace) a tag by type (removes all existing tags of that type, then adds the new one)
 */
export function setTag<E extends { tags: NostrTag[] }>(event: E, tag: NostrTag): E {
  const tags = event.tags.filter(t => t[0] !== tag[0]);
  return { ...event, tags: [...tags, tag] };
}

/**
 * Remove all tags of a given type
 */
export function removeTag<E extends { tags: NostrTag[] }>(event: E, tagType: string): E {
  return { ...event, tags: event.tags.filter(t => t[0] !== tagType) };
}

// -------------------
// Parsing Utilities for NIP-34 & NIP-22 Events
// -------------------

export interface Patch {
  id: string;
  repoId: string;
  title: string;
  description: string;
  author: { pubkey: string; name?: string; avatar?: string };
  baseBranch: string;
  commitCount: number;
  commits: any[];
  commitHash: string;
  createdAt: string;
  diff: any[];
  status: "open" | "applied" | "closed" | "draft";
  raw: PatchEvent;
}

export function parsePatchEvent(event: PatchEvent): Patch {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1];
  const getAllTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);
  const authorTag = event.tags.find(t => t[0] === "committer");
  const author = {
    pubkey: event.pubkey,
    name: authorTag?.[1],
    avatar: authorTag?.[2]
  };
  let status: "open" | "applied" | "closed" | "draft" = "open";
  if (event.tags.some(t => t[0] === "t" && t[1] === "applied")) status = "applied";
  else if (event.tags.some(t => t[0] === "t" && t[1] === "closed")) status = "closed";
  else if (event.tags.some(t => t[0] === "t" && t[1] === "draft")) status = "draft";
  const commits = getAllTags("commit");
  console.log(commits)
  return {
    id: event.id,
    repoId: getTag("a") || "",
    title: getTag("subject") || "",
    description: event.content,
    author,
    baseBranch: getTag("base-branch") || "",
    commitCount: getAllTags("commit").length,
    commitHash: getTag("commit") || "",
    createdAt: new Date(event.created_at * 1000).toISOString(),
    diff: [],
    status,
    raw: event,
    commits: [],
  };
}

export interface Issue {
  id: string;
  repoId: string;
  subject: string;
  content: string;
  author: { pubkey: string };
  labels: string[];
  createdAt: string;
  raw: IssueEvent;
}

export function parseIssueEvent(event: IssueEvent): Issue {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1];
  const getAllTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);
  return {
    id: event.id,
    repoId: getTag("a") || "",
    subject: getTag("subject") || "",
    content: event.content,
    author: { pubkey: event.pubkey },
    labels: getAllTags("t"),
    createdAt: new Date(event.created_at * 1000).toISOString(),
    raw: event
  };
}

export interface RepoAnnouncement {
  id: string;
  repoId: string;
  address: string;
  name?: string;
  owner: string;
  description?: string;
  web?: string[];
  clone?: string[];
  relays?: string[];
  maintainers?: string[];
  hashtags?: string[];
  earliestUniqueCommit?: string; // NIP-34 r tag with 'euc' marker
  createdAt: string;
  raw: RepoAnnouncementEvent;
}

export function parseRepoAnnouncementEvent(event: RepoAnnouncementEvent): RepoAnnouncement {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1];
  const getAllTags = (name: string) => event.tags.filter(t => t[0] === name).map(t => t[1]);
  const getMultiTag = (name: string) => event.tags.filter(t => t[0] === name).flatMap(t => t.slice(1));
  const relaysTag = () => sanitizeRelays(getMultiTag("relays"));
  // Extract earliest unique commit from r tag with 'euc' marker
  const eucTag = event.tags.find(t => t[0] === "r" && t[2] === "euc");
  const earliestUniqueCommit = eucTag?.[1];
  
  return {
    id: event.id,
    repoId: getTag("d") || "",
    address: `${GIT_REPO_ANNOUNCEMENT}:${event.pubkey}:${getTag("d")}`,
    name: getTag("name"),
    owner: event.pubkey,
    description: getTag("description"),
    web: getMultiTag("web"),
    clone: getMultiTag("clone"),
    relays: relaysTag(),
    maintainers: getMultiTag("maintainers"),
    hashtags: getAllTags("t"),
    earliestUniqueCommit,
    createdAt: new Date(event.created_at * 1000).toISOString(),
    raw: event
  };
}

export interface RepoState {
  id: string;
  repoId: string;
  refs: Array<{ ref: string; commit: string; lineage?: string[] }>;
  head?: string;
  createdAt: string;
  raw: RepoStateEvent;
}

export function parseRepoStateEvent(event: RepoStateEvent): RepoState {
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1];
  const refs = event.tags
    .filter(t => t[0].startsWith("refs/"))
    .map(t => ({
      ref: t[0],
      commit: t[1],
      lineage: t.length > 2 ? t.slice(2) : undefined
    }));
  const head = getTag("HEAD");
  return {
    id: event.id,
    repoId: getTag("d") || "",
    refs,
    head,
    createdAt: new Date(event.created_at * 1000).toISOString(),
    raw: event
  };
}

export interface Status {
  id: string;
  status: "open" | "applied" | "closed" | "draft" | "resolved";
  relatedIds: string[];
  author: { pubkey: string };
  createdAt: string;
  raw: StatusEvent;
}

export function parseStatusEvent(event: StatusEvent): Status {
  let status: Status["status"] = "open";
  if (event.kind === 1631) status = "applied";
  else if (event.kind === 1632) status = "closed";
  else if (event.kind === 1633) status = "draft";
  const relatedIds = event.tags.filter(t => t[0] === "e").map(t => t[1]);
  return {
    id: event.id,
    status,
    relatedIds,
    author: { pubkey: event.pubkey },
    createdAt: new Date(event.created_at * 1000).toISOString(),
    raw: event
  };
}
