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
  GitIssueStatus,
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
export { RepoAddressA, parseEucTag, canonicalRepoKey } from "./nip34.js"

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
} from "./nip34-utils.js"
export type {Patch, Issue, RepoAnnouncement, RepoState, Status} from "./nip34-utils.js"

export {
  GIT_COMMENT,
} from "./nip22.js"
// NIP-22 comments
export type {
  CommentTag,
  CommentEvent,
  CreateCommentOpts,
} from "./nip22.js"
export {parseCommentEvent} from "./nip22-utils.js"
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

// NIP-34-adjacent permalink (immutable file range reference)
export { GIT_PERMALINK } from "./permalink.js"
export type { Permalink, PermalinkEvent } from "./permalink.js"

export {
  GIT_LABEL,
} from "./nip32.js"
// NIP-32 labels (helpers)
export {
  extractSelfLabels,
  extractLabelEvents,
  mergeEffectiveLabels,
} from "./nip32.js"
export type {
  Label as Nip32Label,
  EffectiveLabels as Nip32EffectiveLabels,
  LabelEvent,
} from "./nip32.js"

// NIP-32 V2 convergence helpers and types
export {
  extractSelfLabelsV2,
  extractLabelEventsV2,
  mergeEffectiveLabelsV2,
} from "./nip32.js"
export type {
  EffectiveLabelsInput as Nip32EffectiveLabelsInput,
  EffectiveLabelsV2 as Nip32EffectiveLabelsV2,
  LabelTargets as Nip32LabelTargets,
  LabelNamespace as Nip32LabelNamespace,
  LabelValue as Nip32LabelValue,
} from "./nip32.js"

// Nostr I/O adapter types (framework-agnostic)
export type {
  NostrFilter,
  PublishResult,
  EventIO,
  LegacyEventIO,
  SignEvent,
} from "./io-types.js"

// NIP-51
export {
  GRASP_SET_KIND,
  DEFAULT_GRASP_SET_ID,
  GIT_REPO_BOOKMARK_SET,
  GIT_REPO_BOOKMARK_DTAG,
} from "./nip51.js"
export type {
  GraspSetTag,
  GraspSetEvent,
  GitRepoBookmarkSetTag,
  GitRepoBookmarkSetEvent,
} from "./nip51.js"

export {
  BookmarkedRepo,
  validateGraspServerUrl,
  normalizeGraspServerUrl,
  createGraspServersEvent,
  parseGraspServersEvent,
} from "./nip51-utils.js"