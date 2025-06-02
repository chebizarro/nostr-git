// NIP-34: Git Collaboration Event Types for Nostr
// https://github.com/nostr-protocol/nips/blob/master/34.md

import type { Event } from 'nostr-tools';

/**
 * Canonical Nostr event type from nostr-tools.
 * https://jsr.io/@nostr/tools/doc/Event
 */
export type NostrEvent = Event;

/**
 * Generic Nostr tag: [tagName, ...values]
 */
export type NostrTag = [string, ...string[]];

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
  | ["t", string];

export interface RepoAnnouncementEvent extends NostrEvent {
  kind: 30617;
  tags: RepoAnnouncementTag[];
}

// -------------------
// Repository State Announcement (kind: 30618)
// -------------------
export type RepoStateTag =
  | ["d", string]
  | [
      `refs/heads/${string}` | `refs/tags/${string}`,
      string,
      ...string[]
    ]
  | ["HEAD", `ref: refs/heads/${string}`];

export interface RepoStateEvent extends NostrEvent {
  kind: 30618;
  tags: RepoStateTag[];
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
  | ["committer", string, string, string, string];

export interface PatchEvent extends NostrEvent {
  kind: 1617;
  content: string; // git format-patch content
  tags: PatchTag[];
}

// -------------------
// Issue (kind: 1621)
// -------------------
export type IssueTag =
  | ["a", string]
  | ["p", string]
  | ["subject", string]
  | ["t", string]
  | ["e", string];

export interface IssueEvent extends NostrEvent {
  kind: 1621;
  content: string; // markdown text
  tags: IssueTag[];
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
  | ["applied-as-commits", ...string[]];

export interface StatusEvent extends NostrEvent {
  kind: 1630 | 1631 | 1632 | 1633;
  content: string;
  tags: StatusTag[];
}

// -------------------
// Union type for all NIP-34 events
// -------------------
export type Nip34Event =
  | RepoAnnouncementEvent
  | RepoStateEvent
  | PatchEvent
  | IssueEvent
  | StatusEvent;

// Utility: kind to type mapping

// -------------------
// Profile Type for Avatars and User Metadata
// -------------------

export type TrustedEvent = NostrEvent;

export type Profile = {
  pubkey: string;
  name?: string;
  nip05?: string;
  lud06?: string;
  lud16?: string;
  lnurl?: string;
  about?: string;
  banner?: string;
  picture?: string;
  website?: string;
  display_name?: string;
  event?: TrustedEvent;
};
export type Nip34EventByKind<K extends Nip34Event["kind"]> = Extract<Nip34Event, { kind: K }>;
