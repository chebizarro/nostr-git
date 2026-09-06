# Development Guide

Local development for `@nostr-git/core` — a single npm package. (Older revisions
of this guide covered a monorepo with `ui`/`shared-types`/`git-wrapper`/
`extension` packages; those now live in separate repositories.)

## Prerequisites

- **Node.js** 18+
- **pnpm** (this repo pins `pnpm@10.12.4` via `packageManager`)
- **Git** 2.30+

Recommended VS Code extensions: TypeScript, ESLint, Prettier.

## Setup

```bash
git clone https://github.com/chebizarro/nostr-git.git
cd nostr-git
pnpm install
```

## Commands

```bash
pnpm build       # clean → tsc → bundle worker
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint (enforces the tag-helper rule below)
pnpm watch       # tsc + worker bundle in watch mode (scripts/dev.mjs)
pnpm dev         # build once, then watch
```

`prepare` runs `pnpm build`; `prepublishOnly` runs typecheck + lint + test.

## Canonical tag helpers (required)

Always read event tags via the helpers — never `event.tags.find` /
`event.tags.filter`. A repo-wide ESLint rule enforces this and fails CI.

```ts
import { getTag, getTags, getTagValue } from "@nostr-git/core/events"

const committer = getTag(event, "committer")     // first matching tag or undefined
const clones    = getTags(announcement, "clone")  // all matching tags, in order
const repoUrl   = getTagValue(announcement, "r")  // first value or undefined
```

Helpers live in `src/events/nip34/nip34-utils.ts` and are re-exported from the
`events` subpath. This centralizes NIP-34 tag-shape knowledge and keeps parsing
type-safe.

## Runtime validation (Zod)

Optional runtime guarantees are split across two subpaths:

- **`@nostr-git/core/events`** — assertion guards (throw on invalid), from
  `src/events/nip34/validation.ts`: `assertRepoAnnouncementEvent`,
  `assertRepoStateEvent`.
- **`@nostr-git/core/utils`** — `safeParse`-style helpers, from
  `src/utils/validation.ts`: `validateRepoAnnouncementEvent`,
  `validateRepoStateEvent`, `validateIssueTags`, `assertValidTags`,
  `safeParseEventTags`.

```ts
import { validateRepoAnnouncementEvent, validateIssueTags } from "@nostr-git/core/utils"

const evt = { kind: 30617, content: "", tags: [["d", "repo-id"], ["clone", "https://git"]] }
const ok = validateRepoAnnouncementEvent(evt)
if (!ok.success) console.error(ok.error.format())
```

Prefer canonical helpers for normal reads; use strict schemas at boundaries
(ingress/egress, tests) and for untrusted input.

### Feature flag: `NOSTR_GIT_VALIDATE_EVENTS`

- Default: on when `NODE_ENV !== "production"`, off in production.
- Explicit toggle (case-insensitive): truthy `true|1|yes`, falsy `false|0|no`.

```bash
NOSTR_GIT_VALIDATE_EVENTS=true  pnpm test   # force on
NOSTR_GIT_VALIDATE_EVENTS=false pnpm test   # force off
```

## Testing

Tests use **Vitest** and mirror `src/` under `test/`.

```bash
pnpm test                       # all tests
pnpm exec vitest run test/git   # a directory
pnpm exec vitest path/to.spec   # a file (watch)
```

Guidelines: mock relays and Git backends; test pure functions directly; validate
event serialization/deserialization at boundaries. Relay URLs are canonicalized
Welshman-style (bare origins keep a root slash; path/query bytes are endpoint
identity) — don't "correct" trailing slashes in expectations.

## Debugging

- Node: `node --inspect` against a test or example; VS Code JS debugger.
- Worker: the worker bundle is emitted by `scripts/bundle-worker.mjs`; progress
  events surface via the `getGitWorker` progress callback.
- Logging policy: errors and warnings only; warnings suppressed in production.

## Build & release

```bash
pnpm build
npm publish --access public        # or pnpm run publish:latest
pnpm run publish:alpha             # pre-release under the "alpha" dist-tag
```

See [DEPLOYMENT.md](DEPLOYMENT.md) and [RELEASE.md](RELEASE.md).

## Git workflow

- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Conventional commits (e.g. `fix: preserve relay query identity`).
- Pre-commit hooks run lint/format; keep `pnpm lint` and `pnpm test` green.

## Where things live

See [AGENTS.md](AGENTS.md) for the full module map and hard rules, and
[ARCHITECTURE.md](ARCHITECTURE.md) for the architecture.
