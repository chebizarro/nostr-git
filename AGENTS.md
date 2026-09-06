# AGENTS.md — Working on `@nostr-git/core`

Orientation for AI agents (and humans) contributing to this repository. Read
this first. It reflects the **current single-package layout** — older docs that
mention `@nostr-git/ui`, `@nostr-git/shared-types`, or `@nostr-git/git-wrapper`
describe a previous monorepo and no longer apply here.

## What this package is

`@nostr-git/core` is a TypeScript library that bridges **Git** and **Nostr**. It:

- Creates and parses Git-related Nostr events (NIP-34, plus NIP-22/32/51 helpers).
- Runs Git operations via `isomorphic-git`, behind a vendor/provider abstraction.
- Talks to Git service APIs (GitHub, GitLab, Gitea, and **GRASP** relays over REST).
- Runs Git work in a **Web Worker** (Comlink) for browser use.
- Ships one npm package with subpath exports; there is **no** monorepo here.

## Repository layout

```
src/
├── index.ts        # Root barrel: namespaced + convenience exports
├── events/         # Nostr event builders/parsers + tag helpers
│   ├── nip22/  nip32/  nip34/  nip51/
│   └── kinds.ts    # Event-kind constants (see table below)
├── git/            # Git engine, providers, natural-read subsystem, import
├── api/            # Git service API clients
│   └── providers/  # github, gitlab, gitea, bitbucket, grasp, grasp-rest, ...
├── worker/         # Comlink worker: client, operations, progress, workers/
├── blossom/        # Blossom blob storage integration
├── errors/         # Structured GitError model (types + factories)
├── utils/          # Relay sanitization, clone-url fallback, relay policy, ...
└── types/          # Shared types incl. the EventIO abstraction
test/               # Vitest suites, mirrors src/ layout
examples/           # Runnable usage examples (see README)
```

Exports (from `package.json`): `.`, `./events`, `./git`, `./api`, `./worker`,
`./worker/worker.js`, `./blossom`, `./utils`, `./errors`, `./types`.

## Hard rules

### 1. Never read event tags directly

Do **not** use `event.tags.find` / `event.tags.filter`. ESLint enforces this.
Use the canonical helpers, which live in `src/events/nip34/nip34-utils.ts` and
are exported from the `events` subpath:

```ts
import { getTag, getTags, getTagValue } from "@nostr-git/core/events"

const committer = getTag(event, "committer")   // one tag (string[]) or undefined
const clones    = getTags(announcement, "clone") // all matching tags
const repoUrl   = getTagValue(announcement, "r") // first value or undefined
```

### 2. Do not pass signers around — use `EventIO`

The host app injects a single `EventIO` object; core never handles keys directly.
Every relay call is **scoped** to an explicit relay list (`{ relays }`) — never
publish or fetch against an ambient/global pool.

```ts
import type { EventIO } from "@nostr-git/core"

const io: EventIO = {
  fetchEvents:   (filters, scope) => pool.query(filters, scope.relays),
  publishEvent:  (event, scope)   => pool.publish(event, scope.relays), // signs internally
  publishEvents: (events, scope)  => Promise.all(events.map(e => io.publishEvent(e, scope))),
  getCurrentPubkey: () => currentPubkeyOrNull,
  // optional: signEvent(event) => signed, for consumers that sign before publishing
}
```

### 3. Respect provider policy

Some vendors are disabled by policy. Check before constructing a provider, and
prefer the guarded factory functions:

```ts
import {
  isGitVendorEnabled, assertGitVendorEnabled,
  ENABLE_BITBUCKET_PROVIDER, ENABLE_DIRECT_NOSTR_GIT_PROVIDER,
} from "@nostr-git/core"
import { getGitServiceApi, getGitServiceApiFromUrl } from "@nostr-git/core"
```

Bitbucket and the direct-Nostr git provider are currently **off**; `grasp`
(relay API) and `grasp-rest` (HTTP) are the GRASP paths.

## Event kinds (NIP-34)

| Kind  | Constant (`NostrGitKind` / `nip34.ts`)   | Meaning                         |
|-------|------------------------------------------|---------------------------------|
| 30617 | `RepositoryAnnouncement` / `GIT_REPO_ANNOUNCEMENT` | Repository announcement |
| 30618 | `RepositoryState` / `GIT_REPO_STATE`     | Repository state (refs)         |
| 1618  | `PullRequest` / `GIT_PULL_REQUEST`       | Pull request (change proposal)  |
| 1619  | `PullRequestUpdate` / `GIT_PULL_REQUEST_UPDATE` | Pull request update      |
| 1621  | `Issue` / `GIT_ISSUE`                     | Issue                           |
| 1622  | `ConflictMetadata`                       | Merge-conflict metadata         |
| 1623  | `Permalink`                              | Permalink                       |
| 1624  | `CoverLetter`                            | Cover letter                    |
| 1630–1633 | `StatusOpen`/`StatusApplied`/`StatusClosed`/`StatusDraft` | Status events |

Constants live in `src/events/kinds.ts` and `src/events/nip34/nip34.ts`. This
package models change proposals as pull-request events (1618), not NIP-34
patch events (1617).

## Error handling

Use the structured `GitError` model in `src/errors/` rather than throwing bare
`Error`s. Errors carry a `GitErrorCategory`, a `GitErrorCode`, and optional
context. Construct with the factory helpers:

```ts
import { createRepoNotFoundError, createMergeConflictError } from "@nostr-git/core/errors"
throw createRepoNotFoundError({ operation: "clone", remote: url })
```

## Worker model

Heavy Git work runs in a Comlink worker. `getGitWorker()` returns `{ api, worker }`;
call `configureWorkerEventIO(api, io)` once, then invoke `api.*`. Long-running
mutations are tracked as **operations** (`src/worker/operations.ts`) with typed
**progress** events (`src/worker/progress.ts`) and per-repo locking
(`src/worker/workers/repo-operation-lock.ts`). See `examples/worker-usage.ts`.

## Conventions

- **ESM only**, with explicit `.js` extensions in relative imports.
- Named exports; avoid default exports.
- Files kebab-case; classes PascalCase; functions camelCase; kind/flag constants SCREAMING_SNAKE_CASE.
- TypeScript strict mode. Keep public entrypoints free of Node-only APIs (browser/mobile targets).
- Relay URLs are canonicalized Welshman-style: bare origins keep a root slash
  (`wss://host/`), and path/query bytes are preserved as endpoint identity. See
  `src/utils/sanitize-relays.ts`. Don't "fix" trailing slashes in tests.

## Build, test, verify

```bash
pnpm install
pnpm build       # clean → tsc → bundle worker
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint (enforces the tag-helper rule)
```

Tests use **Vitest** and mirror `src/` under `test/`. Mock relays/Git; test pure
functions directly. `prepublishOnly` runs typecheck + lint + test.

## Optional runtime validation

Zod-backed event validation is feature-flagged via `NOSTR_GIT_VALIDATE_EVENTS`
(truthy `true|1|yes`, falsy `false|0|no`; default: on when `NODE_ENV != production`).
Assertion guards (`assertRepoAnnouncementEvent`, …) are on `@nostr-git/core/events`
(`src/events/nip34/validation.ts`); `validate*`/`safeParse*` helpers are on
`@nostr-git/core/utils` (`src/utils/validation.ts`).

## Pointers

- Human architecture: [ARCHITECTURE.md](ARCHITECTURE.md)
- Public API reference: [API.md](API.md)
- Development guide: [DEVELOPMENT.md](DEVELOPMENT.md)
- GRASP REST: [GRASP_REST_IMPLEMENTATION.md](GRASP_REST_IMPLEMENTATION.md)
- Subscriptions: [docs/subscription-cookbook.md](docs/subscription-cookbook.md)
