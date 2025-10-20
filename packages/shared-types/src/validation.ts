import {z} from "zod"

// A Nostr tag is a tuple where the first element is the tag name and
// subsequent elements are string values. Example: ["e", "<event-id>"]
export const NostrTagSchema = z.tuple([z.string()]).rest(z.string())
export type NostrTagRuntime = z.infer<typeof NostrTagSchema>

// A minimal Nostr event-like shape that we can validate at runtime.
export const NostrEventSchema = z.object({
  id: z.string().optional(),
  kind: z.number().optional(),
  content: z.string().optional(),
  tags: z.array(NostrTagSchema),
  created_at: z.number().int().optional(),
  pubkey: z.string().optional(),
  sig: z.string().optional(),
})
export type NostrEventLike = z.infer<typeof NostrEventSchema>

// Narrow-only function: throws if tags are not valid Nostr tags.
export function assertValidTags(event: {
  tags: unknown
}): asserts event is {tags: NostrTagRuntime[]} {
  const res = z.array(NostrTagSchema).safeParse(event.tags)
  if (!res.success) {
    throw new Error(`Invalid event.tags: ${res.error.message}`)
  }
}

// Safe parse helper to validate tags and obtain parsed value or error.
export function safeParseEventTags(event: {tags: unknown}) {
  return z.array(NostrTagSchema).safeParse(event.tags)
}

// =============================
// NIP-34 specific tag schemas
// =============================

// Repository announcement tags (kind 30617)
export const DTag = z.tuple([z.literal("d"), z.string()])
export const NameTag = z.tuple([z.literal("name"), z.string()])
export const DescriptionTag = z.tuple([z.literal("description"), z.string()])
export const WebTag = z.tuple([z.literal("web"), z.string()]).rest(z.string())
export const CloneTag = z.tuple([z.literal("clone"), z.string()]).rest(z.string())
export const RelaysTag = z.tuple([z.literal("relays"), z.string()]).rest(z.string())
export const REarlyUniqueCommitTag = z.tuple([z.literal("r"), z.string(), z.literal("euc")])
export const MaintainersTag = z.tuple([z.literal("maintainers"), z.string()]).rest(z.string())
export const HashtagTag = z.tuple([z.literal("t"), z.string()])

export const RepoAnnouncementTagSchema = z.union([
  DTag,
  NameTag,
  DescriptionTag,
  WebTag,
  CloneTag,
  RelaysTag,
  REarlyUniqueCommitTag,
  MaintainersTag,
  HashtagTag,
  // Allow unknown/extra tags to pass validation without breaking
  NostrTagSchema,
])

export const RepoAnnouncementTagsSchema = z.array(RepoAnnouncementTagSchema)

// Repository state tags (kind 30618)
export const RefsTag = z.tuple([z.string().startsWith("refs/"), z.string()]).rest(z.string())
export const HeadRefTag = z.tuple([z.literal("HEAD"), z.string().startsWith("ref: refs/heads/")])
export const RepoStateTagSchema = z.union([DTag, RefsTag, HeadRefTag])
export const RepoStateTagsSchema = z.array(RepoStateTagSchema)

// Patch tags (kind 1617)
export const AddressRepoTag = z.tuple([z.literal("a"), z.string()])
export const PatchRTag = z.tuple([z.literal("r"), z.string()])
export const PTag = z.tuple([z.literal("p"), z.string()])
export const RootTTag = z.tuple([z.literal("t"), z.literal("root")])
export const RootRevisionTTag = z.tuple([z.literal("t"), z.literal("root-revision")])
export const CommitTag = z.tuple([z.literal("commit"), z.string()])
export const CTag = z.tuple([z.literal("c"), z.string()])
export const ParentCommitTag = z.tuple([z.literal("parent-commit"), z.string()])
export const CommitPgpSigTag = z.tuple([z.literal("commit-pgp-sig"), z.string()]) // can be empty string
export const CommitterTag = z.tuple([
  z.literal("committer"),
  z.string(), // name
  z.string(), // email
  z.string(), // timestamp as string per NIP (producer controlled)
  z.string(), // timezone offset in minutes, as string
])

export const PatchTagSchema = z.union([
  AddressRepoTag,
  PatchRTag,
  PTag,
  RootTTag,
  RootRevisionTTag,
  CommitTag,
  ParentCommitTag,
  CommitPgpSigTag,
  CommitterTag,
  HashtagTag, // allow other t tags as labels if present
])
export const PatchTagsSchema = z.array(PatchTagSchema)

// Issue tags (kind 1621)
export const SubjectTag = z.tuple([z.literal("subject"), z.string()])
export const IssueTagSchema = z.union([AddressRepoTag, PTag, SubjectTag, HashtagTag])
export const IssueTagsSchema = z.array(IssueTagSchema)

// Status tags (kinds 1630..1633)
export const ETagRoot = z.tuple([z.literal("e"), z.string(), z.literal(""), z.literal("root")])
export const ETagReply = z.tuple([z.literal("e"), z.string(), z.literal(""), z.literal("reply")])
export const QTag = z.tuple([z.literal("q"), z.string(), z.string(), z.string()])
export const MergeCommitTag = z.tuple([z.literal("merge-commit"), z.string()])
export const AppliedAsCommitsTag = z
  .tuple([z.literal("applied-as-commits"), z.string()])
  .rest(z.string())
export const StatusRTag = z.tuple([z.literal("r"), z.string()])

export const StatusTagSchema = z.union([
  AddressRepoTag,
  StatusRTag,
  PTag,
  ETagRoot,
  ETagReply,
  QTag,
  MergeCommitTag,
  AppliedAsCommitsTag,
])
export const StatusTagsSchema = z.array(StatusTagSchema)

// Pull Request tags (kind 1618)
export const PullRequestTagSchema = z.union([
  AddressRepoTag,
  PatchRTag,
  PTag,
  SubjectTag,
  HashtagTag,
  CTag,
  CloneTag,
  z.tuple([z.literal("branch-name"), z.string()]),
  z.tuple([z.literal("merge-base"), z.string()]),
  z.tuple([z.literal("e"), z.string()]),
])
export const PullRequestTagsSchema = z.array(PullRequestTagSchema)

// Pull Request Update tags (kind 1619)
export const PullRequestUpdateTagSchema = z.union([
  AddressRepoTag,
  PatchRTag,
  PTag,
  CTag,
  CloneTag,
  z.tuple([z.literal("merge-base"), z.string()]),
])
export const PullRequestUpdateTagsSchema = z.array(PullRequestUpdateTagSchema)

// User Grasp List tags (kind 10317)
export const UserGraspListTagSchema = z.tuple([z.literal("g"), z.string()])
export const UserGraspListTagsSchema = z.array(UserGraspListTagSchema)

// Convenience per-kind tag validators
export const validateRepoAnnouncementTags = (tags: unknown) =>
  RepoAnnouncementTagsSchema.safeParse(tags)
export const validateRepoStateTags = (tags: unknown) => RepoStateTagsSchema.safeParse(tags)
export const validatePatchTags = (tags: unknown) => PatchTagsSchema.safeParse(tags)
export const validateIssueTags = (tags: unknown) => IssueTagsSchema.safeParse(tags)
export const validateStatusTags = (tags: unknown) => StatusTagsSchema.safeParse(tags)

// =============================
// Stricter per-kind event schemas
// =============================

function hasTagName(tags: unknown[], name: string) {
  return Array.isArray(tags) && tags.some(t => Array.isArray(t) && t[0] === name)
}

export const RepoAnnouncementEventSchema = NostrEventSchema.extend({
  kind: z.literal(30617),
  tags: RepoAnnouncementTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "d")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Repo announcement must include a 'd' tag (repo id)",
    })
  }
})

export const RepoStateEventSchema = NostrEventSchema.extend({
  kind: z.literal(30618),
  tags: RepoStateTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "d")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Repo state must include a 'd' tag (repo id)",
    })
  }
})

export const PatchEventSchema = NostrEventSchema.extend({
  kind: z.literal(1617),
  tags: PatchTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "a")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Patch must include an 'a' tag (address of repo announcement)",
    })
  }
})

export const IssueEventSchema = NostrEventSchema.extend({
  kind: z.literal(1621),
  tags: IssueTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "a")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Issue must include an 'a' tag (address of repo announcement)",
    })
  }
})

export const StatusEventSchema = NostrEventSchema.extend({
  kind: z.union([z.literal(1630), z.literal(1631), z.literal(1632), z.literal(1633)]),
  tags: StatusTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "e")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Status must include at least one 'e' tag (target event)",
    })
  }
  if (!hasTagName(evt.tags as unknown[], "p")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Status should include at least one 'p' tag (participants)",
    })
  }
})

// Pull Request event (kind 1618)
export const PullRequestEventSchema = NostrEventSchema.extend({
  kind: z.literal(1618),
  tags: PullRequestTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "a")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pull Request must include an 'a' tag (repo address)",
    })
  }
})

// Pull Request Update event (kind 1619)
export const PullRequestUpdateEventSchema = NostrEventSchema.extend({
  kind: z.literal(1619),
  tags: PullRequestUpdateTagsSchema,
}).superRefine((evt, ctx) => {
  if (!hasTagName(evt.tags as unknown[], "a")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pull Request update must include an 'a' tag (repo address)",
    })
  }
})

// User Grasp List event (kind 10317)
export const UserGraspListEventSchema = NostrEventSchema.extend({
  kind: z.literal(10317),
  tags: UserGraspListTagsSchema,
})

export const validateRepoAnnouncementEvent = (evt: unknown) =>
  RepoAnnouncementEventSchema.safeParse(evt)
export const validateRepoStateEvent = (evt: unknown) => RepoStateEventSchema.safeParse(evt)
export const validatePatchEvent = (evt: unknown) => PatchEventSchema.safeParse(evt)
export const validateIssueEvent = (evt: unknown) => IssueEventSchema.safeParse(evt)
export const validateStatusEvent = (evt: unknown) => StatusEventSchema.safeParse(evt)

// Convenience per-kind validators
export const validatePullRequestEvent = (evt: unknown) => PullRequestEventSchema.safeParse(evt)
export const validatePullRequestUpdateEvent = (evt: unknown) => PullRequestUpdateEventSchema.safeParse(evt)
export const validateUserGraspListEvent = (evt: unknown) => UserGraspListEventSchema.safeParse(evt)
