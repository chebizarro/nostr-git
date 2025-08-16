# Phase 3 — Reflection (Snapshot at 2025-08-16)

This document captures the current state of the monorepo for Phase 3 reflection: builds, types, tests, storybook, security, and surface metadata per package.

## Scope snapshot

- Packages: `@nostr-git/shared-types`, `@nostr-git/git-wrapper`, `@nostr-git/core`, `@nostr-git/ui` (+ internal storybook workspace)
- Platforms: Browser + Mobile (browser-first), Node for tooling/tests
- Git implementation: libgit2-compatible fork of isomorphic-git via wrapper; browser uses LightningFS + http/web; Node uses fs + http/node
- NIPs focus now: NIP-34, NIP-22, NIP-51 (optional NIP-78 behind flag later)

## Entrypoints, public exports, build outputs

### @nostr-git/shared-types
- Entrypoints: `dist/index.js`
- Exports: `.` with `types` + `import`
- Types: `dist/index.d.ts`
- Build outputs: `dist/*` (20+ files; notable: `validation.js` ~7.6 KB, `utils.js` ~13.5 KB)
- Version: 0.1.0

### @nostr-git/git-wrapper
- Entrypoints (split):
  - Browser: `dist/index.web.js` (LightningFS + `isomorphic-git/http/web`)
  - Node/SSR: `dist/index.node.js` (Node `fs` + `isomorphic-git/http/node`)
  - Root: `dist/index.js` (maps appropriately via exports)
- Public exports: factory (`getGitProvider`), providers (`IsomorphicGitProvider`, `NostrGitProvider`), utils (`git-patch-content`, `git-diff-content`), config, prefs store
- Build outputs: `dist/*` (notable: `nostr-git-provider.js` ~30 KB, `isomorphic-git-provider.js` ~6.1 KB)
- Version: 0.1.0

### @nostr-git/core
- Entrypoint: `dist/index.js`
- Public exports: core Git-Nostr orchestration APIs (depends on `@nostr-git/git-wrapper` and `@nostr-git/shared-types`)
- Build outputs: not generated (build failing in this snapshot)
- Version: 0.0.1

### @nostr-git/ui
- Entrypoint: `dist/index.js` (`svelte`, `import`, `require` fields point to same file)
- Public exports: Svelte components, hooks, utilities
- Build outputs: `dist/*` (stories, components compiled to JS, `useNewRepo.svelte.js` ~36.6 KB)
- Version: 0.1.0

## Interfaces/APIs changed since Phase 2
- Split entrypoints introduced in `@nostr-git/git-wrapper` (`index.web.ts`, `index.node.ts`, factories). Exports map updated accordingly.
- Factory API `getGitProvider()` remains sync. Added environment-aware selection.
- Documentation updated (README, API.md). Node and browser example added.
- Note: Precise diff vs Phase 2 tag not available; this is the curated summary for Phase 3 work so far.

## What’s done vs planned

- Completed:
  - Split entries in git-wrapper with clean exports (browser-first)
  - Node/browser factories implemented and tested
  - Core tests adjusted to use temp dirs; wrapper tests green
  - Docs updated: README and API.md entries for split entries and caching
  - Example added: `examples/basic-clone-status.ts`
- In progress / Planned:
  - Core build/typecheck fixes (imports to forked isomorphic-git/http, LightningFS typing)
  - Storybook build for UI workspace (currently failing)
  - Dedupe pass and provider capability matrix
  - NIP compliance verification (22/34/51), optional 78 behind flag

## Quality gates status (commands run locally)

- shared-types
  - build: PASS (`pnpm --filter @nostr-git/shared-types build`)
  - typecheck: Not run explicitly (build generated d.ts)
  - tests: Pending
- git-wrapper
  - build: PASS
  - typecheck: Implicit via `tsc` PASS
  - tests: PASS (12 tests, 3 files)
  - example: PASS (`examples/basic-clone-status.ts` prints version + 0 status entries)
- core
  - build: FAIL (TS2307 import issues; see Notes below)
  - typecheck: FAIL (same errors)
  - tests: Not executed due to type errors
- ui
  - build: PASS (`svelte-package`)
  - svelte-check: Pending
  - storybook: FAIL in `packages/storybook` workspace (see below)
- storybook workspace
  - storybook:build: FAIL (MainFileEvaluationError; `@sveltejs/vite-plugin-svelte` exports resolution)

Security
- `pnpm audit --audit-level=high`: 2 vulnerabilities found (both moderate; high+ none)
- `osv-scanner --recursive .`: Not available in environment (skipped)

## Runtime demos / smoke
- git-wrapper example (`examples/basic-clone-status.ts`): PASS

## Risks & technical debt
- Core imports `isomorphic-git/http/web` and `@isomorphic-git/lightning-fs` directly in `src/lib/*`, which should route via git-wrapper for env-safe usage.
- `IsomorphicGitProvider` named export mismatch observed by core (TS2305). Ensure wrapper exports surface matches core usage, or update core to new provider surface.
- Storybook build uses `@sveltejs/vite-plugin-svelte` versions that may not align with Storybook 8.6; need resolution or config tweak.
- Duplicated utilities likely across wrapper/core for diff/patch processing; consolidate to one implementation (prefer wrapper’s utilities or move to a shared utils module).

## Potential unintended breaking changes
- Split entry map may affect consumers relying on deep internal paths. Documented explicit paths are stable. Keep root import stable.

## Metrics snapshot (approx.)
- shared-types: dist 21 files (~>30 KB total JS), exports count: ~10+ symbols
- git-wrapper: dist 30 files (largest `nostr-git-provider.js` ~30 KB)
- core: no dist (build failing)
- ui: dist ~20 files (largest `useNewRepo.svelte.js` ~36.6 KB)
- Tests: git-wrapper 12 tests; others pending run
- Storybook stories: present under `packages/ui/src/lib/**.stories.svelte` (numerous), build failing in standalone storybook workspace

## Notes: core build errors (exact)
- TS2307: Cannot find module 'isomorphic-git/http/web' (`src/lib/github-http.ts`)
- TS2307: Cannot find module '@isomorphic-git/lightning-fs' (`src/lib/workers/git-worker.ts`)
- TS2305: Module '@nostr-git/git-wrapper' has no exported member 'IsomorphicGitProvider' (update imports or wrapper exports)

## Next steps (immediate)
1. Core: Replace direct `isomorphic-git/http/web` and `@isomorphic-git/lightning-fs` imports with `@nostr-git/git-wrapper` factory and abstractions; add minimal adapter if needed.
2. Wrapper: Ensure `IsomorphicGitProvider` is exported (it is in dist; verify types) or migrate core to the unified `GitProvider` surface.
3. Storybook: Align versions and fix `main.ts` config to resolve `@sveltejs/vite-plugin-svelte` via ESM. Consider pinning to compatible versions noted in `packages/storybook/package.json`.
4. Add svelte-check for UI to quality gates and fix diagnostics.
5. Produce DEDUPE-REPORT and propose consolidations.
