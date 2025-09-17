# @nostr-git/git-wrapper

TypeScript wrapper that bridges a Git backend with Nostr NIP-34 collaboration events (ngit-aligned).

## Key features

- Nostr discovery of repo announcements and repo state
- Clone URL preference + SSH heuristic with pluggable persistence
- Push partitioning: PR refs -> GIT_PATCH events, normal refs -> server push
- Default PR patch content with unified diff (isomorphic-git)
- Status events after push/merge with participant enrichment
- Collaboration subscriptions filtered by repo address

## Quick start

````ts
import { NostrGitProvider } from './src/nostr-git-provider.js';
import { makeRepoAddr } from './src/repo-addr.js';
import { FileProtocolPrefs } from './src/prefs-store.js';
import fs from 'node:fs';

// Your concrete GitProvider and NostrClient implementations
const git = /* ... */;
const nostr = /* ... */;

const provider = new NostrGitProvider(git, nostr);
provider.configureProtocolPrefsStore(new FileProtocolPrefs(fs, `${process.cwd()}/.ngit/prefs.json`));

const repoId = 'my-repo';
const ownerPubkey = 'f'.repeat(64);
const repoAddr = makeRepoAddr(ownerPubkey, repoId);

// Clone with discovery + preference/SSH heuristic
await provider.clone({ dir: '/tmp/repo', repoId, timeoutMs: 2500 });

// Push: PR ref publishes a GIT_PATCH with enriched metadata and diff
await provider.push({
  dir: '/tmp/repo',
  fs,
  refspecs: ['refs/heads/pr/feature-x'],
  repoId,
  repoAddr,
  baseBranch: 'refs/heads/main',
  // Optional fine-grained patch content
  // getPatchContent: async (ctx) => generateUnifiedDiffLike(ctx),
});

// Push: normal ref -> server; optionally emit status
await provider.push({
  dir: '/tmp/repo',
  refspecs: ['refs/heads/main'],
  repoId,
  nostrStatus: {
    repoAddr,
    rootId: 'root-event-id-of-thread',
    content: 'Push applied to main',
    close: false,
  },
});

// Merge with status emission
await provider.merge({
  dir: '/tmp/repo',
  theirs: 'refs/heads/feature-x',
  ours: 'refs/heads/main',
  nostrStatus: {
    repoAddr,
    rootId: 'root-event-id-of-thread',
    content: 'Merged feature-x into main',
    close: true, // also emit GIT_STATUS_CLOSED
  },
});

## Usage

### Factory + caching

Prefer the factory to obtain a provider with sensible defaults and caching:

```ts
import { getGitProvider } from '@nostr-git/git-wrapper';

const git = getGitProvider();
await git.clone({ dir: '/my/repo', url: 'https://github.com/owner/repo.git' });
const head = await git.resolveRef({ dir: '/my/repo', ref: 'HEAD' });
````

### Browser usage snippet

When used in a browser app (e.g., Svelte with `ssr=false`), the browser entry is selected automatically. LightningFS and `http/web` are wired for you:

```ts
import {getGitProvider} from "@nostr-git/git-wrapper"

const git = getGitProvider()
await git.init({dir: "/my-repo"})
const status = await git.statusMatrix({dir: "/my-repo"})
console.log("entries:", status.length)
```

Configure behavior via env (Node) or by calling `loadConfig()` with overrides when embedding:

- `LIBGIT2_COMPAT` = `true|false` — toggles compat behavior in the v2 engine.
- `GIT_CACHE_MODE` = `off|per-session|per-repo-batch` — caching strategy (default `per-session`).
- `GIT_CACHE_TTL_MS` = number — idle TTL for per-session caches (default `60000`).

You can also directly wrap a provider with cache using `CachedGitProvider` if you need custom composition.

### Factory behavior and caching

The factory returns a singleton `GitProvider` with optional caching layered on top:

- `GIT_CACHE_MODE` (default: `per-session`)
  - `off` — no caching
  - `per-session` — memoizes results for a short idle TTL
  - `per-repo-batch` — groups operations within a repo for the duration of a batch
- `GIT_CACHE_TTL_MS` (default: `60000`) — idle TTL for `per-session` caches

Programmatic override when embedding:

```ts
import {getGitProvider} from "@nostr-git/git-wrapper"
import {loadConfig} from "@nostr-git/git-wrapper"

// Override at call site
const git = getGitProvider({cacheMode: "per-session", cacheTtlMs: 45_000})
```

The singleton is reused across calls to `getGitProvider()` for the process/session.

### Entry points (browser vs node)

This package ships split entry points so browser apps never see Node-only imports:

- Browser: `dist/index.web.js` (LightningFS + `isomorphic-git/http/web`)
- Node/SSR: `dist/index.node.js` (Node `fs` + `isomorphic-git/http/node`)

The `package.json` exports map selects the right entry automatically:

```json
{
  "exports": {
    ".": {
      "browser": "./dist/index.web.js",
      "import": "./dist/index.node.js",
      "require": "./dist/index.node.js"
    }
  }
}
```

Most consumers can simply:

```ts
import {getGitProvider} from "@nostr-git/git-wrapper"
```

If you need to target explicitly:

```ts
// Browser explicit
import {getGitProvider} from "@nostr-git/git-wrapper/dist/index.web.js"

// Node explicit
import {getGitProvider} from "@nostr-git/git-wrapper/dist/index.node.js"
```

### Direct adapter

If you need to wire your own fs/http, use the adapter:

```ts
import {IsomorphicGitProvider} from "@nostr-git/git-wrapper"
import http from "isomorphic-git/http/web"
import LightningFS from "@isomorphic-git/lightning-fs"

const git = new IsomorphicGitProvider({
  fs: LightningFS,
  http,
  corsProxy: "https://cors.isomorphic-git.org",
})
```

## Examples

- Normal push with fallback and status: `examples/push-normal.ts`
- PR push emitting NIP-34 GIT_PATCH: `examples/push-pr.ts`
- Clone-and-PR with real commits and unified diff: `examples/clone-and-pr.ts`

Run examples:

```bash
pnpm -w --filter @nostr-git/git-wrapper build
node packages/git-wrapper/examples/push-normal.ts
node packages/git-wrapper/examples/push-pr.ts
node packages/git-wrapper/examples/clone-and-pr.ts
```

## API highlights

- `discoverRepo(repoId, { timeoutMs, stateKind })` -> `{ urls, branches, tags, event, state }`
- `announceRepoState({ identifier, state, kind, content? })` -> `eventId`
- `clone({ dir, repoId, url?, timeoutMs? })`
  - If `url` missing, discovered URLs are used; preference store consulted; SSH preferred.
- `push({ refspecs, repoId?, repoAddr?, baseBranch?, patchContent?, getPatchContent?, fs?, dir?, nostrStatus? })`
  - Partition PR refs vs normal.
  - PR refs publish `GIT_PATCH` with:
    - tags: `['t','base:<branch>']`, `['parent-commit', <oid>]`, `['committer', name, email, ts, tz]`, `['p', pubkey]...`
    - recipients include owner, maintainers, and discovered participants.
    - content fallback: `patchContent` -> `getPatchContent()` -> default cover letter + unified diff.
  - Normal refs delegate to git backend and may emit status (`nostrStatus`).
- `merge({ ..., nostrStatus? })` emits `GIT_STATUS_APPLIED`, optional `GIT_STATUS_CLOSED`.
- `configureProtocolPrefsStore(store)` for persistence.
- `subscribeToCollaborationEvents(repoId, onEvent)`.

## Helpers

- `makeRepoAddr(pubkey, repoId)` / `isRepoAddr(addr)`
- Default diff: `generateUnifiedDiff({ fs, dir, baseRef, headRef })`

## Testing

From the monorepo root:

```sh
pnpm -w --filter @nostr-git/git-wrapper test
```

## More docs

- Top-level API guide (Git Wrapper API section): `../../API.md#git-wrapper-api-nostr-gitgit-wrapper`
- Development notes for git-wrapper: `../../DEVELOPMENT.md#package-nostr-gitgit-wrapper`

## Notes

- All events use NIP-34 kinds and helpers from `@nostr-git/shared-types`.
- Unified diff is lightweight and optional; ngit clients can still operate without it.
