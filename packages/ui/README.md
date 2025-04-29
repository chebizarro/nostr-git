# @nostr-git/ui

Svelte component library for rendering Git and Nostr events.

## Features

- Git Repository cards
- Commit Snippet renderers
- Repo Status badges
- Nostr Publish buttons

## Installation

```bash
npm install @nostr-git/ui
```

## Usage

```svelte
<script lang="ts">
  import { GitEventCard } from "@nostr-git/ui";
</script>

<GitEventCard event={myEvent} />
```

## Development

```bash
pnpm install
pnpm run build
```

## License

MIT License
