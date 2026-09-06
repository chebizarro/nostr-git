# Architecture (working notes)

For the full architecture, see the root [ARCHITECTURE.md](../ARCHITECTURE.md).
This file holds pre-release hardening notes specific to `@nostr-git/core`.

- **Package**: single npm package `@nostr-git/core` with subpath exports
  (`./events`, `./git`, `./api`, `./worker`, `./blossom`, `./errors`,
  `./utils`, `./types`). The former `@nostr-git/ui`, `@nostr-git/shared-types`,
  and `@nostr-git/git-wrapper` packages now live in separate repositories.
- **Runtime targets**: browser and mobile as well as Node; Node-only
  dependencies are kept out of public entrypoints.
- **NIPs in scope**: NIP-34 (git repo events), NIP-22, NIP-32 (labels),
  NIP-51 (lists).
- **Git engine**: `isomorphic-git` (with lazy object fetch / shallow ops),
  plus the natural-read subsystem over `@fiatjaf/git-natural-api`.
- **Providers**: GitHub, GitLab, Gitea, and GRASP (relay-native + REST) via the
  unified `GitProvider` / `GitServiceApi` interfaces; Bitbucket and direct-Nostr
  git are disabled by `provider-policy.ts`.
- **Safety guardrails**: HEAD-parity checks before push; explicit consent for
  destructive/remote-altering ops; relay-identity hardening (path/query bytes
  are endpoint identity).
- **Caching**: opt-in IndexedDB-backed caches for repositories and natural-read.
- **Logging**: errors and warnings only; warnings suppressed in production.
