# Deployment — Publishing `@nostr-git/core`

This is a single npm package. There is no extension or UI build in this repo.

## Build

```bash
pnpm install
pnpm build        # clean → tsc (tsconfig.base.json) → bundle worker
```

Output goes to `dist/`. The worker is bundled separately by
`scripts/bundle-worker.mjs` and exposed as the `./worker/worker.js` export.

## Pre-publish gates

`prepublishOnly` runs automatically on `npm publish`:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Run them manually first to fail fast. See
[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md).

## Versioning

Semantic versioning. Bump with:

```bash
npm version patch|minor|major --no-git-tag-version   # then commit + tag manually
# or `npm version <x.y.z>` to let it commit + tag
```

Keep the version in sync with the copy embedded in `flotilla-budabit/packages/
nostr-git-core` when that mirror is updated.

## Publish

```bash
# stable → npm "latest"
pnpm run publish:latest        # npm publish --access public

# pre-release → npm "alpha" dist-tag
pnpm run publish:alpha         # npm publish --access public --tag alpha
```

The package is public and scoped, so `--access public` is required on first
publish. Requires npm auth (`npm whoami`).

## Tag & push

```bash
git tag vX.Y.Z
git push --follow-tags        # push to GitHub + the nostr:// remote
```

## Rollback

npm does not allow re-publishing a version. To roll back:

```bash
npm dist-tag add @nostr-git/core@<previous> latest   # repoint "latest"
# deprecate a bad release if needed:
npm deprecate @nostr-git/core@<bad> "use <previous>"
```

Unpublish is only possible within npm's short window and is discouraged.

## Consuming the package

Subpath exports: `.`, `./events`, `./git`, `./api`, `./worker`,
`./worker/worker.js`, `./blossom`, `./errors`, `./utils`, `./types`. The build
targets ESM with `.js` extensions and keeps Node-only APIs out of public
entrypoints for browser/mobile consumers.

## Runtime configuration

- `NOSTR_GIT_VALIDATE_EVENTS` — toggle Zod event validation (see
  [DEVELOPMENT.md](DEVELOPMENT.md)).
- Logging is errors/warnings only; warnings are suppressed in production.
