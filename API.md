# API Documentation

This document describes the APIs provided by the Nostr-Git project, including the core library APIs, Git service APIs, and extension interfaces.

## Core Library API (@nostr-git/core)

### Event Creation API

#### `createRepoEvent(repo: GitRepository): UnsignedEvent`
Creates a NIP-34 repository announcement event.

```typescript
import { createRepoEvent } from '@nostr-git/core';

const repo = {
  name: 'my-project',
  url: 'https://github.com/user/my-project',
  description: 'A sample project',
  maintainers: ['npub1...']
};

const event = createRepoEvent(repo);
// Returns unsigned event that needs to be signed before publishing
```

#### `createPatchEvent(patch: GitPatch): UnsignedEvent`
Creates a NIP-34 patch event for Git patches.

```typescript
import { createPatchEvent } from '@nostr-git/core';

const patch = {
  repoUrl: 'https://github.com/user/repo',
  title: 'Fix bug in authentication',
  description: 'This patch fixes the authentication issue',
  diff: '--- a/auth.js\n+++ b/auth.js\n...',
  commits: [/* commit objects */]
};

const event = createPatchEvent(patch);
```

#### `createIssueEvent(issue: GitIssue): UnsignedEvent`
Creates a NIP-34 issue event.

```typescript
import { createIssueEvent } from '@nostr-git/core';

const issue = {
  repoUrl: 'https://github.com/user/repo',
  title: 'Bug: Login fails with special characters',
  body: 'When using special characters in password...',
  labels: ['bug', 'authentication']
};

const event = createIssueEvent(issue);
```

### Git Operations API

#### `cloneRepository(url: string, options?: CloneOptions): Promise<Result<Repository>>`
Clones a Git repository with Nostr integration.

```typescript
import { cloneRepository } from '@nostr-git/core';

const result = await cloneRepository('https://github.com/user/repo', {
  depth: 1,
  branch: 'main'
});

if (result.success) {
  console.log('Repository cloned:', result.data.path);
} else {
  console.error('Clone failed:', result.error.message);
}
```

#### `createPatch(options: PatchOptions): Promise<Result<GitPatch>>`
Creates a Git patch from repository changes.

```typescript
import { createPatch } from '@nostr-git/core';

const result = await createPatch({
  repoPath: '/path/to/repo',
  fromCommit: 'abc123',
  toCommit: 'def456'
});

if (result.success) {
  const patch = result.data;
  console.log('Patch created:', patch.title);
}
```

### Worker API

#### `getGitWorker(onProgress?: ProgressCallback): { api: GitWorkerAPI, worker: Worker }`
Gets a Git worker instance for background operations.

```typescript
import { getGitWorker } from '@nostr-git/core';

const { api, worker } = getGitWorker((progress) => {
  console.log(`Progress: ${progress.percentage}%`);
});

// Perform operations in background
const result = await api.cloneAndFork({
  url: 'https://github.com/user/repo',
  targetDir: '/tmp/repo'
});

// Clean up when done
worker.terminate();
```

## Git Service API

The Git Service API provides a unified interface for different Git hosting providers (GitHub, GitLab, Gitea, Bitbucket).

### Factory Functions

#### `getGitServiceApi(provider: GitProvider, config: ProviderConfig): GitServiceApi`
Creates a Git service API instance for the specified provider.

```typescript
import { getGitServiceApi, GitProvider } from '@nostr-git/core';

const api = getGitServiceApi(GitProvider.GitHub, {
  baseUrl: 'https://api.github.com',
  token: 'ghp_...' // Optional authentication token
});
```

#### `getGitServiceApiFromUrl(repoUrl: string): GitServiceApi`
Auto-detects provider from repository URL and creates appropriate API instance.

```typescript
import { getGitServiceApiFromUrl } from '@nostr-git/core';

const api = getGitServiceApiFromUrl('https://github.com/user/repo');
// Returns GitHub API instance
```

### GitServiceApi Interface

#### Repository Operations

```typescript
interface GitServiceApi {
  // Get repository information
  getRepository(owner: string, repo: string): Promise<RepositoryInfo>;
  
  // List repository branches
  getBranches(owner: string, repo: string): Promise<Branch[]>;
  
  // Get commit information
  getCommit(owner: string, repo: string, sha: string): Promise<CommitInfo>;
  
  // Get file content
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<FileContent>;
}
```

#### Usage Examples

```typescript
// Get repository information
const repoInfo = await api.getRepository('user', 'repo');
console.log(`Repository: ${repoInfo.name}, Stars: ${repoInfo.starCount}`);

// List branches
const branches = await api.getBranches('user', 'repo');
console.log('Branches:', branches.map(b => b.name));

// Get file content
const content = await api.getFileContent('user', 'repo', 'README.md');
console.log('README content:', content.text);
```

## Extension APIs

### Browser Extension API

The browser extension provides APIs for integrating with web-based Git platforms.

#### Content Script API

```typescript
// Inject Nostr publishing buttons into GitHub pages
interface ContentScriptAPI {
  injectNostrButtons(): void;
  publishRepoEvent(repoData: GitRepository): Promise<void>;
  publishIssueEvent(issueData: GitIssue): Promise<void>;
}
```

#### Background Script API

```typescript
// Handle Nostr operations in background
interface BackgroundAPI {
  signEvent(event: UnsignedEvent): Promise<NostrEvent>;
  publishEvent(event: NostrEvent, relays: string[]): Promise<void>;
  subscribeToEvents(filter: EventFilter): Promise<NostrEvent[]>;
}
```

### VSCode Extension API

The VSCode extension provides commands and UI integration for Nostr-Git operations.

#### Commands

```typescript
// Available VSCode commands
interface VSCodeCommands {
  'nostr-git.publishRepo': () => Promise<void>;
  'nostr-git.createPatch': () => Promise<void>;
  'nostr-git.subscribeToRepo': (repoUrl: string) => Promise<void>;
  'nostr-git.viewNostrEvents': () => Promise<void>;
}
```

#### Usage in VSCode

```typescript
// Register command handler
vscode.commands.registerCommand('nostr-git.publishRepo', async () => {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;
  
  const repoInfo = await getRepositoryInfo(workspaceFolder.uri.fsPath);
  const event = createRepoEvent(repoInfo);
  
  // Sign and publish event
  await publishToNostr(event);
});
```

## Error Handling

All APIs use Result types for consistent error handling:

```typescript
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Usage pattern
const result = await someOperation();
if (result.success) {
  // Handle success case
  console.log(result.data);
} else {
  // Handle error case
  console.error(result.error.message);
}
```

### Common Error Types

```typescript
interface GitError {
  code: 'REPO_NOT_FOUND' | 'INVALID_URL' | 'NETWORK_ERROR' | 'AUTH_REQUIRED';
  message: string;
  details?: unknown;
}

interface NostrError {
  code: 'SIGNING_FAILED' | 'RELAY_ERROR' | 'INVALID_EVENT';
  message: string;
  details?: unknown;
}
```

## Rate Limiting

Git service APIs implement rate limiting to respect provider limits:

```typescript
// Rate limiting is handled automatically
const api = getGitServiceApi(GitProvider.GitHub, {
  baseUrl: 'https://api.github.com',
  token: 'ghp_...',
  rateLimit: {
    maxRequests: 5000,
    windowMs: 3600000 // 1 hour
  }
});
```

## Authentication

### GitHub API Authentication

```typescript
const api = getGitServiceApi(GitProvider.GitHub, {
  baseUrl: 'https://api.github.com',
  token: process.env.GITHUB_TOKEN // Personal access token
});
```

### Nostr Event Signing

```typescript
import { signEvent } from 'nostr-tools';

const privateKey = process.env.NOSTR_PRIVATE_KEY;
const signedEvent = signEvent(unsignedEvent, privateKey);
```

## WebSocket Subscriptions

Subscribe to Nostr events in real-time:

```typescript
import { subscribeToEvents } from '@nostr-git/core';

const subscription = await subscribeToEvents({
  kinds: [30617], // Repository announcements
  '#r': ['https://github.com/user/repo'] // Repository URL tag
});

subscription.on('event', (event) => {
  console.log('New repository event:', event);
});

// Clean up subscription
subscription.close();
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
  relays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ],
  defaultProvider: 'github',
  cacheTimeout: 300000, // 5 minutes
  maxRetries: 3
};
```

This API documentation provides comprehensive coverage of all public APIs in the Nostr-Git project, with practical examples and error handling patterns.

---

## Git Wrapper API (@nostr-git/git-wrapper)

The Git Wrapper bridges a concrete Git backend with Nostr NIP-34 collaboration events, implementing the ngit architecture in TypeScript.

### Importing

```ts
import { NostrGitProvider } from '@nostr-git/git-wrapper/src/nostr-git-provider.js';
import { makeRepoAddr } from '@nostr-git/git-wrapper/src/repo-addr.js';
import { FileProtocolPrefs } from '@nostr-git/git-wrapper/src/prefs-store.js';
```

### Construction

```ts
const git /*: GitProvider*/ = /* your isomorphic-git based provider */;
const nostr /*: NostrClient*/ = /* your nostr client (publish/subscribe/signing) */;
const provider = new NostrGitProvider(git, nostr);

// Optional: persist preferred clone/push URL per repoId
import fs from 'node:fs';
provider.configureProtocolPrefsStore(new FileProtocolPrefs(fs, `${process.cwd()}/.ngit/prefs.json`));
```

### Repo Address Helpers

```ts
const ownerPubkey = 'f'.repeat(64);
const repoAddr = makeRepoAddr(ownerPubkey, 'my-repo'); // e.g. "kind:pubkey:identifier"
```

### Discovery

```ts
const discovered = await provider.discoverRepo('my-repo', { timeoutMs: 2000 });
// discovered.urls (clone URLs), discovered.branches, discovered.tags
```

### Clone with Protocol Preference and SSH Heuristic

```ts
await provider.clone({ dir: '/tmp/repo', repoId: 'my-repo', timeoutMs: 2500 });
// If url omitted: prefers stored preference else SSH if present, then others.
```

### Push Partitioning and PR Patch Events

```ts
await provider.push({
  dir: '/tmp/repo',
  fs, // enables unified diff in default patch content
  refspecs: ['refs/heads/pr/feature-x'],
  repoId: 'my-repo',
  repoAddr,
  baseBranch: 'refs/heads/main',
  // Optional content controls
  // patchContent: 'Custom content',
  // getPatchContent: async (ctx) => '...'
});
```

Behavior:
- PR refs publish NIP-34 `GIT_PATCH` with enriched tags:
  - `['t','base:<branch>']`, `['parent-commit', <oid>]`, `['committer', name, email, ts, tz]`
  - recipients from announcement (owner/maintainers) + thread participants (`['p']`)
- Content fallback: `patchContent` → `getPatchContent()` → default cover letter + unified diff

### Normal Push with Optional Status Emission

```ts
await provider.push({
  dir: '/tmp/repo',
  refspecs: ['refs/heads/main'],
  repoId: 'my-repo',
  nostrStatus: {
    repoAddr,
    rootId: 'root-event-id',
    content: 'Push applied to main',
    close: false // set true to emit GIT_STATUS_CLOSED
  }
});
```

Resilience:
- On server push failure, provider discovers alternate URLs, retries once with a different URL, and updates preference on success.

### Merge with Status Events

```ts
await provider.merge({
  dir: '/tmp/repo',
  ours: 'refs/heads/main',
  theirs: 'refs/heads/feature-x',
  nostrStatus: { repoAddr, rootId: 'root-event-id', content: 'Merged feature-x', close: true }
});
```

Emits `GIT_STATUS_APPLIED` (and `GIT_STATUS_CLOSED` when `close: true`) with enriched participants.

### Subscriptions

```ts
const subId = provider.subscribeToCollaborationEvents('my-repo', (evt) => {
  console.log('Collab evt', evt.kind, evt.id);
});
```

### Default Unified Diff Helper

```ts
import { generateUnifiedDiff } from '@nostr-git/git-wrapper/src/git-diff-content.js';
const diff = await generateUnifiedDiff({ fs, dir: '/tmp/repo', baseRef: 'refs/heads/main', headRef: 'refs/heads/feature-x' });
```

