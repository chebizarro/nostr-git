# Architecture — `@nostr-git/core`

`@nostr-git/core` is a **single TypeScript package** that bridges Git version
control with the Nostr protocol (NIP-34 and related NIPs). It targets browsers
and mobile as well as Node, so public entrypoints avoid Node-only APIs.

> This is no longer a monorepo. The Svelte UI, shared types, and git-wrapper
> that older revisions describe now live in separate repositories.

See also: [AGENTS.md](AGENTS.md) (contributor rules) and
[Git Stacking and Merge Metadata](docs/nostr-git-stacking.md).

## Layered view

```
┌──────────────────────────────────────────────────────────────┐
│ Consumers: host apps, extensions, workers (inject EventIO)    │
├──────────────────────────────────────────────────────────────┤
│ Convenience + namespaced barrel  (src/index.ts)               │
├───────────────┬───────────────┬───────────────┬──────────────┤
│  events/      │  git/         │  api/         │  worker/     │
│  NIP-34/22/   │  engine +     │  service API  │  Comlink     │
│  32/51 build  │  providers +  │  clients      │  client +    │
│  + parse +    │  natural-read │  (GitHub/Lab/ │  operations  │
│  tag helpers  │  + import     │  Gitea/GRASP) │  + progress  │
├───────────────┴───────────────┴───────────────┴──────────────┤
│  Cross-cutting: types (EventIO), errors, utils, blossom       │
├──────────────────────────────────────────────────────────────┤
│  External: nostr-tools · isomorphic-git · comlink · zod       │
└──────────────────────────────────────────────────────────────┘
```

## Modules

### `events/` — Nostr event layer
Builders and parsers for NIP-34 (repo announcements/state, issues, pull
requests, statuses, permalinks, cover letters), plus NIP-22, NIP-32 (labels),
and NIP-51 (lists). Event-kind constants are in `kinds.ts`. The canonical tag
helpers (`getTag`/`getTags`/`getTagValue`) live in `nip34/nip34-utils.ts` and
are the **only** supported way to read tags. Optional Zod validation is in
`nip34/validation.ts`.

### `git/` — Git engine and providers
Git operations run through `isomorphic-git` behind a `GitProvider` interface
(`provider.ts`, `isomorphic-git-provider.ts`, `multi-vendor-git-provider.ts`).
`provider-factory.ts` / `vendor-provider-factory.ts` select a provider from a
URL or vendor id, gated by `provider-policy.ts` (Bitbucket and direct-Nostr git
are currently disabled). The **natural-read** subsystem
(`natural-read-*.ts`) provides a cached, indexed read API over repositories
(`@fiatjaf/git-natural-api`), with layered caches (in-memory, IndexedDB,
observed) and a PR-review adapter. `import-config.ts` and platform adapters
convert external repos/issues/PRs into Nostr events.

### `api/` — Git service API clients
REST/relay clients implementing `GitServiceApi` for GitHub, GitLab, Gitea, and
**GRASP**. GRASP has two paths: `grasp.ts`/`grasp-api.ts` (relay-native, with
`grasp-capabilities.ts` NIP-11 capability negotiation and `grasp-state.ts`) and
`grasp-rest.ts` (smart-HTTP). `nostr-git-provider.ts` orchestrates discovery of
repo announcements/state through the injected `EventIO`.

### `worker/` — background execution
A Comlink worker isolates heavy Git work from the UI thread. `client.ts`
(`getGitWorker`, `configureWorkerEventIO`) is the entrypoint; `operations.ts`
tracks long-running mutations with terminal-state semantics; `progress.ts`
emits typed progress; `workers/` holds the operation implementations (clone,
push, PR merge, repo management, sync, remote backfill) plus per-repo locking
(`repo-operation-lock.ts`) and caching (`cache.ts`).

### Cross-cutting
- **`types/`** — the `EventIO` abstraction (relay-scoped fetch/publish/sign,
  no signer passing) and shared Nostr types.
- **`errors/`** — structured `GitError` model: `GitErrorCategory`,
  `GitErrorCode`, context, and `create*Error` factories.
- **`utils/`** — relay sanitization/canonicalization (Welshman-aligned),
  clone-URL fallback ordering, and repo relay policy.
- **`blossom/`** — Blossom blob storage integration.

## Data flow

**Publish** — a Git operation produces an unsigned event, which core hands to
`EventIO.publishEvent(event, { relays })`; the host signs and broadcasts to the
explicit relay scope.

**Consume** — core calls `EventIO.fetchEvents(filters, { relays })` against a
scoped relay set, parses events with the `events/` helpers, and resolves
repository state/status.

Every relay interaction is **scoped** to an explicit relay list — core never
uses an ambient global pool.

## Safety guardrails

- Provider policy disables Bitbucket and direct-Nostr git providers.
- Relay identity is hardened: URLs are canonicalized without dropping
  path/query bytes, which are treated as endpoint identity.
- Push paths validate GRASP repository/relay identity before mutating.
- Optional feature-flagged runtime validation of events (Zod).

## Technology choices

- **isomorphic-git** — pure-JS Git for browser/mobile.
- **nostr-tools** — Nostr primitives (events, keys, relay URL normalization).
- **comlink** — ergonomic typed worker RPC.
- **zod** — optional runtime event validation.
- **@fiatjaf/git-natural-api** — natural-read repository access.
- **fflate / @noble/hashes / file-type / diff** — compression, hashing, MIME
  sniffing, and diffing.

## Distribution

One package with subpath exports (`./events`, `./git`, `./api`, `./worker`,
`./blossom`, `./errors`, `./utils`, `./types`) plus the worker bundle
(`./worker/worker.js`). Build = `clean → tsc → bundle worker`. See
[DEPLOYMENT.md](DEPLOYMENT.md) and [API.md](API.md).
