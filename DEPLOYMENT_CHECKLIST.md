# Pre-Publish Checklist — `@nostr-git/core`

Run through this before `npm publish`.

## 1. Clean tree & correct branch

```bash
git status            # clean working tree
git pull --rebase
```

## 2. Quality gates

```bash
pnpm install
pnpm typecheck
pnpm lint             # includes the tag-helper ESLint rule
pnpm test             # vitest — all green
pnpm build            # tsc + worker bundle succeed
```

## 3. Version & notes

- [ ] Bump `version` in `package.json` (semver).
- [ ] Update [RELEASE.md](RELEASE.md) with the highlights.
- [ ] Sync the version into `flotilla-budabit/packages/nostr-git-core` if that
      mirror is being updated in lockstep.

## 4. Publish

```bash
pnpm run publish:latest        # or publish:alpha for pre-releases
```

## 5. Tag & push

```bash
git tag vX.Y.Z
git push --follow-tags         # GitHub + nostr:// remote
```

## 6. Verify

- [ ] `npm view @nostr-git/core version` shows the new version.
- [ ] A fresh `npm i @nostr-git/core` resolves and imports
      (`import * as ngit from "@nostr-git/core"`).
