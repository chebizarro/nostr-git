# API Documentation

This document describes the public APIs of `@nostr-git/core`: the event layer, Git service APIs, the Git provider/repo helpers, and the worker client.

See also: [Git Stacking and Merge Metadata](docs/nostr-git-stacking.md)

## Canonical Tag Helpers (Required)

Always access Nostr event tags via helpers from `@nostr-git/core/events`:

```ts
import {getTag, getTags, getTagValue} from "@nostr-git/core/events"

const firstCommitter = getTag(event, "committer")
const cloneTags = getTags(announcement, "clone")
const repoUrl = getTagValue(announcement, "r")
```

Do not use `event.tags.find` or `event.tags.filter` directly. ESLint enforces this repo-wide; exceptions only apply within the `events` module (`src/events/`) where helpers are implemented.

## Core Library API (@nostr-git/core)

### Event Creation API

#### `createRepoEvent(repo: GitRepository): UnsignedEvent`

Creates a NIP-34 repository announcement event.

```typescript
import {createRepoEvent} from "@nostr-git/core"

const repo = {
  name: "my-project",
  url: "https://github.com/user/my-project",
  description: "A sample project",
  maintainers: ["npub1..."],
}

const event = createRepoEvent(repo)
// Returns unsigned event that needs to be signed before publishing
```

#### `createIssueEvent(issue: GitIssue): UnsignedEvent`

Creates a NIP-34 issue event.

```typescript
import {createIssueEvent} from "@nostr-git/core"

const issue = {
  repoUrl: "https://github.com/user/repo",
  title: "Bug: Login fails with special characters",
  body: "When using special characters in password...",
  labels: ["bug", "authentication"],
}

const event = createIssueEvent(issue)
```

### Git Operations API

#### `cloneRepository(url: string, options?: CloneOptions): Promise<Result<Repository>>`

Clones a Git repository with Nostr integration.

```typescript
import {cloneRepository} from "@nostr-git/core"

const result = await cloneRepository("https://github.com/user/repo", {
  depth: 1,
  branch: "main",
})

if (result.success) {
  console.log("Repository cloned:", result.data.path)
} else {
  console.error("Clone failed:", result.error.message)
}
```

### Worker API

#### `getGitWorker(onProgress?: ProgressCallback): { api: GitWorkerAPI, worker: Worker }`

Gets a Git worker instance for background operations.

```typescript
import {getGitWorker} from "@nostr-git/core"

const {api, worker} = getGitWorker(progress => {
  console.log(`Progress: ${progress.percentage}%`)
})

// Perform operations in background
const result = await api.cloneAndFork({
  url: "https://github.com/user/repo",
  targetDir: "/tmp/repo",
})

// Clean up when done
worker.terminate()
```

## Runtime Validation Guards (Feature-Flagged)

To protect against malformed Nostr events at runtime, Nostr-Git provides optional validation: `assert*` guards from `@nostr-git/core/events` and `validate*` helpers from `@nostr-git/core/utils`, backed by Zod schemas.

- Default: enabled in development, disabled in production.
- Toggle via environment variable: `NOSTR_GIT_VALIDATE_EVENTS`.
  - Truthy: `true`, `1`, `yes`
  - Falsy: `false`, `0`, `no`

#### Core Guards

Guards are exported by `@nostr-git/core` and throw on invalid input when validation is enabled.

```ts
import {assertRepoAnnouncementEvent, assertRepoStateEvent} from "@nostr-git/core"

function ingestAnnouncement(evt: unknown) {
  assertRepoAnnouncementEvent(evt) // throws if invalid (when enabled)
  // evt now narrowed to RepoAnnouncementEvent
}

function ingestState(evt: unknown) {
  assertRepoStateEvent(evt) // throws if invalid (when enabled)
}
```

#### Subscription paths

Validation is applied at ingress:

- Repo discovery ignores invalid repo announcements.
- Repo state subscription rejects invalid state events.
- Collaboration streams (pull request/issue/status) only deliver valid events to callbacks.

Behavior is controlled by the same `NOSTR_GIT_VALIDATE_EVENTS` flag.

#### Host fetch/publish paths

Hosts that wire in `EventIO` should validate at the boundary:

- On fetch: filter out invalid announcements from relays.
- On publish: preflight-validate outgoing repo announcement, repo state, and issue events before signing/publishing.

```ts
// Example: ensure a repo announcement is valid before signing/publishing
import {validateRepoAnnouncementEvent} from "@nostr-git/core/utils"

const res = validateRepoAnnouncementEvent(unsignedAnnouncement)
if (!res.success) throw new Error(res.error.message)
```

See Development Guide for usage guidance and testing tips.

## Git Service API

The Git Service API provides a unified interface for different Git hosting providers (GitHub, GitLab, Gitea, Bitbucket).

### Factory Functions

#### `getGitServiceApi(provider: GitProvider, config: ProviderConfig): GitServiceApi`

Creates a Git service API instance for the specified provider.

```typescript
import {getGitServiceApi, GitProvider} from "@nostr-git/core"

const api = getGitServiceApi(GitProvider.GitHub, {
  baseUrl: "https://api.github.com",
  token: "ghp_...", // Optional authentication token
})
```

#### `getGitServiceApiFromUrl(repoUrl: string): GitServiceApi`

Auto-detects provider from repository URL and creates appropriate API instance.

```typescript
import {getGitServiceApiFromUrl} from "@nostr-git/core"

const api = getGitServiceApiFromUrl("https://github.com/user/repo")
// Returns GitHub API instance
```

### GitServiceApi Interface

#### Repository Operations

```typescript
interface GitServiceApi {
  // Get repository information
  getRepository(owner: string, repo: string): Promise<RepositoryInfo>

  // List repository branches
  getBranches(owner: string, repo: string): Promise<Branch[]>

  // Get commit information
  getCommit(owner: string, repo: string, sha: string): Promise<CommitInfo>

  // Get file content
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<FileContent>
}
```

#### Usage Examples

```typescript
// Get repository information
const repoInfo = await api.getRepository("user", "repo")
console.log(`Repository: ${repoInfo.name}, Stars: ${repoInfo.starCount}`)

// List branches
const branches = await api.getBranches("user", "repo")
console.log(
  "Branches:",
  branches.map(b => b.name),
)

// Get file content
const content = await api.getFileContent("user", "repo", "README.md")
console.log("README content:", content.text)
```

## Error Handling

All APIs use Result types for consistent error handling:

```typescript
type Result<T, E = Error> = {success: true; data: T} | {success: false; error: E}

// Usage pattern
const result = await someOperation()
if (result.success) {
  // Handle success case
  console.log(result.data)
} else {
  // Handle error case
  console.error(result.error.message)
}
```

### Common Error Types

```typescript
interface GitError {
  code: "REPO_NOT_FOUND" | "INVALID_URL" | "NETWORK_ERROR" | "AUTH_REQUIRED"
  message: string
  details?: unknown
}

interface NostrError {
  code: "SIGNING_FAILED" | "RELAY_ERROR" | "INVALID_EVENT"
  message: string
  details?: unknown
}
```

## Rate Limiting

Git service APIs implement rate limiting to respect provider limits:

```typescript
// Rate limiting is handled automatically
const api = getGitServiceApi(GitProvider.GitHub, {
  baseUrl: "https://api.github.com",
  token: "ghp_...",
  rateLimit: {
    maxRequests: 5000,
    windowMs: 3600000, // 1 hour
  },
})
```

## Authentication

### GitHub API Authentication

```typescript
const api = getGitServiceApi(GitProvider.GitHub, {
  baseUrl: "https://api.github.com",
  token: process.env.GITHUB_TOKEN, // Personal access token
})
```

### Nostr Event Signing

```typescript
import {signEvent} from "nostr-tools"

const privateKey = process.env.NOSTR_PRIVATE_KEY
const signedEvent = signEvent(unsignedEvent, privateKey)
```

## WebSocket Subscriptions

Subscribe to Nostr events in real-time:

```typescript
import {subscribeToEvents} from "@nostr-git/core"

const subscription = await subscribeToEvents({
  kinds: [30617], // Repository announcements
  "#r": ["https://github.com/user/repo"], // Repository URL tag
})

subscription.on("event", event => {
  console.log("New repository event:", event)
})

// Clean up subscription
subscription.close()
```

## Configuration

### Environment Variables

```bash
# Nostr configuration
NOSTR_PRIVATE_KEY=nsec1...
NOSTR_RELAY_URLS=wss://relay.damus.io,wss://nos.lol

# Git provider tokens
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=glpat-...
GITEA_TOKEN=...

# Debug settings
DEBUG=nostr-git:*
LOG_LEVEL=info
```

### Configuration Files

```typescript
// nostr-git.config.js
export default {
  relays: ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"],
  defaultProvider: "github",
  cacheTimeout: 300000, // 5 minutes
  maxRetries: 3,
}
```

This API documentation provides comprehensive coverage of all public APIs in the Nostr-Git project, with practical examples and error handling patterns.

---
## Git provider & repository helpers

This single package includes the Git provider and NIP-34 orchestration that
previously lived in `@nostr-git/git-wrapper`. There are no separate
`git-wrapper` split entry points or `prefs-store` adapters.

### Getting a provider

```ts
import { getGitProvider, initializeNostrGitProvider } from "@nostr-git/core"

const git = getGitProvider() // isomorphic-git-backed GitProvider
```

For Nostr-native orchestration (repo discovery/state via injected `EventIO`):

```ts
import { NostrGitProvider } from "@nostr-git/core/api"
// See src/api/providers/nostr-git-provider.ts
```

Select a service API from a vendor id or URL (gated by provider policy):

```ts
import { getGitServiceApi, getGitServiceApiFromUrl } from "@nostr-git/core"
```

### Repo address helpers

Always construct repo addresses via the helpers:

```ts
import { makeRepoAddr, isRepoAddr } from "@nostr-git/core/utils"
// See src/utils/repo-addr.ts

const repoAddr = makeRepoAddr(ownerPubkey, repoId)
console.assert(isRepoAddr(repoAddr))
```

### Examples

Runnable examples live in `examples/`:

- `examples/push-normal.ts` — normal push with clone-URL fallback and status
- `examples/push-pr.ts` — PR push emitting NIP-34 pull-request events
- `examples/clone-and-pr.ts` — clone-and-PR with real commits and unified diff
- `examples/basic-clone-status.ts` — clone + status via the factory
- `examples/worker-usage.ts` — worker client with `EventIO`

```bash
pnpm build
node examples/push-normal.ts
```
