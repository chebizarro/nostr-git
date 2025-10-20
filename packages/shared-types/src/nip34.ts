// NIP-34: Git Collaboration Event Types for Nostr
// https://github.com/nostr-protocol/nips/blob/master/34.md

import type {Event} from "nostr-tools"
import {nip19} from "nostr-tools"

/**
 * Canonical Nostr event type from nostr-tools.
 * https://jsr.io/@nostr/tools/doc/Event
 */
export type NostrEvent = Event

/**
 * Generic Nostr tag: [tagName, ...values]
 */
export type NostrTag = [string, ...string[]]

// -------------------
// Kind Number Constants
// -------------------

// Repository events
export const GIT_REPO_ANNOUNCEMENT = 30617
export const GIT_REPO_STATE = 30618

// Patch events
export const GIT_PATCH = 1617

// Issue events
export const GIT_ISSUE = 1621

// Pull Request events
export const GIT_PULL_REQUEST = 1618
export const GIT_PULL_REQUEST_UPDATE = 1619

// User grasp lists
export const GIT_USER_GRASP_LIST = 10317

// Status events
export const GIT_STATUS_OPEN = 1630
export const GIT_STATUS_APPLIED = 1631
export const GIT_STATUS_CLOSED = 1632
export const GIT_STATUS_DRAFT = 1633

// -------------------
// Repository Announcement (kind: 30617)
// -------------------
export type RepoAnnouncementTag =
  | ["d", string] // repo-id
  | ["name", string]
  | ["description", string]
  | ["web", ...string[]]
  | ["clone", ...string[]]
  | ["relays", ...string[]]
  | ["r", string, "euc"]
  | ["maintainers", ...string[]]
  | ["t", string]

export interface RepoAnnouncementEvent extends NostrEvent {
  kind: typeof GIT_REPO_ANNOUNCEMENT
  tags: RepoAnnouncementTag[]
}

// -------------------
// Repository State Announcement (kind: 30618)
// -------------------
export type RepoStateTag =
  | ["d", string]
  | [`refs/heads/${string}` | `refs/tags/${string}`, string, ...string[]]
  | ["HEAD", `ref: refs/heads/${string}`]

export interface RepoStateEvent extends NostrEvent {
  kind: typeof GIT_REPO_STATE
  tags: RepoStateTag[]
}

// -------------------
// Patch (kind: 1617)
// -------------------
export type PatchTag =
  | ["a", string]
  | ["r", string]
  | ["p", string]
  | ["t", string]
  | ["commit", string]
  | ["parent-commit", string]
  | ["commit-pgp-sig", string]
  | ["committer", string, string, string, string]
  | ["in-reply-to", string]

export interface PatchEvent extends NostrEvent {
  kind: typeof GIT_PATCH
  content: string // git format-patch content
  tags: PatchTag[]
}

// -------------------
// Issue (kind: 1621)
// -------------------
export type IssueTag =
  | ["a", string]
  | ["p", string]
  | ["subject", string]
  | ["t", string]
  | ["e", string]

export interface IssueEvent extends NostrEvent {
  id: string
  kind: typeof GIT_ISSUE
  content: string // markdown text
  tags: IssueTag[]
}

// -------------------
// Pull Request (kind: 1618)
// -------------------
export type PullRequestTag =
  | ["a", string]
  | ["r", string]
  | ["p", string]
  | ["subject", string]
  | ["t", string]
  | ["c", string]
  | ["clone", ...string[]]
  | ["branch-name", string]
  | ["e", string]
  | ["merge-base", string]

export interface PullRequestEvent extends NostrEvent {
  kind: typeof GIT_PULL_REQUEST
  content: string
  tags: PullRequestTag[]
}

// -------------------
// Pull Request Update (kind: 1619)
// -------------------
export type PullRequestUpdateTag =
  | ["a", string]
  | ["r", string]
  | ["p", string]
  | ["c", string]
  | ["clone", ...string[]]
  | ["merge-base", string]

export interface PullRequestUpdateEvent extends NostrEvent {
  kind: typeof GIT_PULL_REQUEST_UPDATE
  content: string
  tags: PullRequestUpdateTag[]
}

// -------------------
// User Grasp List (kind: 10317)
// -------------------
export type UserGraspListTag = ["g", string]

export interface UserGraspListEvent extends NostrEvent {
  kind: typeof GIT_USER_GRASP_LIST
  content: string
  tags: UserGraspListTag[]
}

// -------------------
// Status (kinds: 1630, 1631, 1632, 1633)
// -------------------
export type StatusTag =
  | ["e", string, "", "root"]
  | ["e", string, "", "reply"]
  | ["p", string]
  | ["a", string, ...string[]]
  | ["r", string]
  | ["e", string, "", "mention"]
  | ["merge-commit", string]
  | ["applied-as-commits", ...string[]]

export interface StatusEvent extends NostrEvent {
  kind:
    | typeof GIT_STATUS_OPEN
    | typeof GIT_STATUS_CLOSED
    | typeof GIT_STATUS_APPLIED
    | typeof GIT_STATUS_DRAFT
  content: string
  tags: StatusTag[]
}

// -------------------
// Union type for all NIP-34 events
// -------------------
export type Nip34Event =
  | RepoAnnouncementEvent
  | RepoStateEvent
  | PatchEvent
  | IssueEvent
  | PullRequestEvent
  | PullRequestUpdateEvent
  | UserGraspListEvent
  | StatusEvent

// Utility: kind to type mapping

// -------------------
// Profile Type for Avatars and User Metadata
// -------------------

export type TrustedEvent = NostrEvent

export type Profile = {
  pubkey: string
  name?: string
  nip05?: string
  lud06?: string
  lud16?: string
  lnurl?: string
  about?: string
  banner?: string
  picture?: string
  website?: string
  display_name?: string
  event?: TrustedEvent
}
export type Nip34EventByKind<K extends Nip34Event["kind"]> = Extract<Nip34Event, {kind: K}>

// -------------------
// Additional helpers
// -------------------

// Repo address pointer using 30617 (NIP-34 repo announcement kind)
export type RepoAddressA = `30617:${string}:${string}`;

// Extract r:euc (Encoded URL Component) tag value
export function parseEucTag(tags: string[][]): string | undefined {
  const r = tags.find(t => t[0] === "r" && t[2] === "euc");
  return r ? r[1] : undefined;
}

// Canonical repo key: `${npub}/${name}` if name provided, otherwise `${npub}`
export function canonicalRepoKey(pubkey: string, name?: string): string {
  const cleanName = (name ?? "").trim();
  try {
    const npub = nip19.npubEncode(pubkey);
    return cleanName.length > 0 ? `${npub}/${cleanName}` : npub;
  } catch (_e) {
    // Fallback to raw pubkey if encoding fails
    return cleanName.length > 0 ? `${pubkey}/${cleanName}` : pubkey;
  }
}

export enum GitIssueStatus {
  OPEN = "Open",
  CLOSED = "Closed",
  RESOLVED = "Resolved",
  DRAFT = "Draft"
}
