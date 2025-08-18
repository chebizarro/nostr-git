// Explicit, curated public API barrel for @nostr-git/shared-types

// NIP-34 constants and types
export {
  GIT_REPO_ANNOUNCEMENT,
  GIT_REPO_STATE,
  GIT_PATCH,
  GIT_ISSUE,
  GIT_STATUS_OPEN,
  GIT_STATUS_APPLIED,
  GIT_STATUS_CLOSED,
  GIT_STATUS_DRAFT,
} from "./nip34.js"
export type {
  NostrEvent,
  NostrTag,
  RepoAnnouncementTag,
  RepoAnnouncementEvent,
  RepoStateTag,
  RepoStateEvent,
  PatchTag,
  PatchEvent,
  IssueTag,
  IssueEvent,
  StatusTag,
  StatusEvent,
  Nip34Event,
  Nip34EventByKind,
  Profile,
  TrustedEvent,
} from "./nip34.js"

// Utilities: type guards, labels, tag helpers, creators, immutable tag ops, parsers
export {
  isRepoAnnouncementEvent,
  isRepoStateEvent,
  isPatchEvent,
  isIssueEvent,
  isStatusEvent,
  isCommentEvent,
  getNostrKindLabel,
  getTag,
  getTags,
  getTagValue,
  createRepoAnnouncementEvent,
  createRepoStateEvent,
  createClonedRepoStateEvent,
  createPatchEvent,
  createIssueEvent,
  createStatusEvent,
  addTag,
  setTag,
  removeTag,
  parsePatchEvent,
  parseIssueEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  parseStatusEvent,
} from "./utils.js"
export type {Patch, Issue, RepoAnnouncement, RepoState, Status} from "./utils.js"

// NIP-22 comments
export type {CommentTag, CommentEvent, CreateCommentOpts} from "./nip22.js"
export {parseCommentEvent} from "./utils-comment.js"
export {createCommentEvent} from "./nip22.js"

// Core git types
export type {Commit, FileDiff, CommitDiff} from "./core.js"

// Relay sanitizer
export {normalizeRelayUrl, sanitizeRelays} from "./sanitize-relays.js"

// Runtime validation (Zod schemas and validators)
export {
  NostrTagSchema,
  NostrEventSchema,
  validateRepoAnnouncementTags,
  validateRepoStateTags,
  validatePatchTags,
  validateIssueTags,
  validateStatusTags,
  RepoAnnouncementEventSchema,
  RepoStateEventSchema,
  PatchEventSchema,
  IssueEventSchema,
  StatusEventSchema,
  validateRepoAnnouncementEvent,
  validateRepoStateEvent,
  validatePatchEvent,
  validateIssueEvent,
  validateStatusEvent,
} from "./validation.js"
export type {NostrTagRuntime, NostrEventLike} from "./validation.js"
