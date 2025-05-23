# Git-Nostr Monorepo

This is the Git-Nostr monorepo containing shared packages and apps for integrating Git and Nostr.

## Packages

- **[@nostr-git/core](packages/core/)** – Core TypeScript library for creating, parsing, and publishing Git-related Nostr events.
- **[@nostr-git/ui](packages/ui/)** – Svelte component library for rendering Git and Nostr UI elements.
- **[@nostr-git/shared-types](packages/shared-types/)** – Shared TypeScript types for Git/Nostr event structures.
- **Extension** – Browser extension that adds Nostr publishing buttons to GitHub.
- **VSCode-ngit** – VS Code extension adding Nostr Git (`ngit`) support to the IDE.
- **Actions** – GitHub Actions for publishing Nostr Git events automatically on push, issue creation, etc.

## Development

```bash
pnpm install
cd packages/storybook
pnpm storybook
```

## Publish

Each package can be built and published independently.

```bash
cd packages/core
pnpm publish --access public
```

## License

MIT License unless otherwise stated.
