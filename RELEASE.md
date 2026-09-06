# Release Notes — `@nostr-git/core`

## 1.1.1

Documentation overhaul for the single-package layout: added [AGENTS.md](AGENTS.md)
(agent/contributor orientation) with a pointer from `CLAUDE.md`; rewrote
`ARCHITECTURE.md`, `DEVELOPMENT.md`, `DEPLOYMENT.md`, and the deploy checklist for
`@nostr-git/core`; corrected cross-package references in `API.md`; removed the
dead `TOKEN_USAGE_AUDIT.md` (it described the separate UI package). No code changes.

## 1.1.0

First stable line since the `1.0.0-alpha.1` npm publish. Consolidates the work
that landed while the package lived inside the `flotilla-budabit` monorepo and
re-establishes standalone publishing.

### Highlights
- **GRASP support**: relay-native provider (`grasp`, with NIP-11 capability
  negotiation) and smart-HTTP provider (`grasp-rest`).
- **Natural-read subsystem**: cached, indexed repository read API
  (`@fiatjaf/git-natural-api`) with in-memory/IndexedDB/observed cache layers
  and a PR-review adapter.
- **Worker operations & progress**: long-running mutations tracked with
  terminal-state semantics, typed progress events, and per-repo locking.
- **Relay-identity hardening**: relay URLs canonicalized without dropping
  path/query bytes (endpoint identity), Welshman-aligned.
- **Provider policy**: Bitbucket and the direct-Nostr git provider disabled by
  default via `provider-policy.ts`.
- **`EventIO` abstraction**: relay-scoped fetch/publish/sign — hosts inject one
  IO object; core never passes signers around.

### Maintenance
- Bumped `nostr-tools` to `^2.25.2`.
- Documentation overhauled for the single-package layout; agent guidance moved
  to [AGENTS.md](AGENTS.md).

## Publishing

```bash
pnpm build
npm publish --access public          # or: pnpm run publish:latest
# pre-releases: pnpm run publish:alpha  (npm dist-tag "alpha")
```

`prepublishOnly` runs typecheck + lint + test. See [DEPLOYMENT.md](DEPLOYMENT.md).
