// Explicit, curated public API barrel for @nostr-git/shared-types

// NIP-34 constants and types
export {
  GIT_REPO_ANNOUNCEMENT,
  GIT_REPO_STATE,
  GIT_PATCH,
  GIT_STACK,
  GIT_MERGE_METADATA,
  GIT_CONFLICT_METADATA,
  GIT_ISSUE,
  GIT_PULL_REQUEST,
  GIT_PULL_REQUEST_UPDATE,
  GIT_USER_GRASP_LIST,
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
  StackTag,
  StackEvent,
  MergeMetadataTag,
  MergeMetadataEvent,
  ConflictMetadataTag,
  ConflictMetadataEvent,
  IssueTag,
  IssueEvent,
  PullRequestTag,
  PullRequestUpdateTag,
  UserGraspListTag,
  PullRequestEvent,
  PullRequestUpdateEvent,
  UserGraspListEvent,
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
  isPullRequestEvent,
  isPullRequestUpdateEvent,
  isUserGraspListEvent,
  isStackEvent,
  isMergeMetadataEvent,
  isConflictMetadataEvent,
  isCommentEvent,
  getNostrKindLabel,
  getTag,
  getTags,
  getTagValue,
  createRepoAnnouncementEvent,
  createRepoStateEvent,
  createClonedRepoStateEvent,
  createPatchEvent,
  createStackEvent,
  createMergeMetadataEvent,
  createConflictMetadataEvent,
  createIssueEvent,
  createStatusEvent,
  addTag,
  setTag,
  removeTag,
  parsePatchEvent,
  parseIssueEvent,
  createPullRequestEvent,
  createPullRequestUpdateEvent,
  createUserGraspListEvent,
  parsePullRequestEvent,
  parsePullRequestUpdateEvent,
  parseUserGraspListEvent,
  parseRepoAnnouncementEvent,
  parseRepoStateEvent,
  parseStatusEvent,
} from "./nip34-utils.js"
export type {Patch, Issue, RepoAnnouncement, RepoState, Status} from "./nip34-utils.js"
export type {
  PullRequest,
  PullRequestUpdate,
  UserGraspList,
} from "./nip34-utils.js"

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
export type {
  Commit,
  FileDiff,
  CommitDiff,
  CommitMeta,
} from "./core.js"

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
  StackTagSchema,
  StackTagsSchema,
  MergeMetaTagSchema,
  MergeMetaTagsSchema,
  ConflictMetaTagSchema,
  ConflictMetaTagsSchema,
  RepoAnnouncementEventSchema,
  RepoStateEventSchema,
  PatchEventSchema,
  IssueEventSchema,
  StatusEventSchema,
  StackEventSchema,
  MergeMetadataEventSchema,
  ConflictMetadataEventSchema,
  validateRepoAnnouncementEvent,
  validateRepoStateEvent,
  validatePatchEvent,
  validateIssueEvent,
  validateStatusEvent,
  validatePullRequestEvent,
  validatePullRequestUpdateEvent,
  validateUserGraspListEvent,
  validateStackEvent,
  validateMergeMetadataEvent,
  validateConflictMetadataEvent,
} from "./validation.js"
export type {NostrTagRuntime, NostrEventLike} from "./validation.js"

// NIP-34-adjacent permalink (immutable file range reference)
export { GIT_PERMALINK } from "./permalink.js"
export type { Permalink, PermalinkEvent } from "./permalink.js"

export { GIT_LABEL } from "./nip32.js"
// NIP-32 unified API
export {
  extractSelfLabels,
  extractLabelEvents,
  mergeEffectiveLabels,
} from "./nip32.js"
export type {
  Label as Nip32Label,
  LabelEvent,
  EffectiveLabels,
  LabelTargets,
  LabelNamespace,
  LabelValue,
  EffectiveLabelsInput,
} from "./nip32.js"

// NIP-32 create/parse utilities
export {
  isLabelEvent,
  createLabelEvent,
  createRoleLabelEvent,
  parseLabelEvent,
  parseRoleLabelEvent,
  getLabelNamespaces,
  getLabelValues,
} from "./nip32-utils.js"

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
  BookmarkAddress,
  validateGraspServerUrl,
  normalizeGraspServerUrl,
  createGraspServersEvent,
  parseGraspServersEvent,
} from "./nip51-utils.js"