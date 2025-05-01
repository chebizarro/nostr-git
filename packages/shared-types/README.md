# @nostr-git/shared-types

Shared TypeScript types for Nostr NIP-34 Git collaboration events, fully compatible with [nostr-tools](https://github.com/nbd-wtf/nostr-tools).

## Installation

```bash
pnpm add @nostr-git/shared-types
# or
npm install @nostr-git/shared-types
```

## Usage

```ts
import type { Nip34Event, RepoAnnouncementEvent, isPatchEvent } from '@nostr-git/shared-types';
import type { Event as NostrEvent } from 'nostr-tools';

// Type-safe event handling
function handle(event: Nip34Event) {
  if (isPatchEvent(event)) {
    // event is PatchEvent
    console.log(event.content);
  }
}
```

## Features
- **Strict types for all NIP-34 event kinds** (repo, patch, issue, status, etc)
- **Type guards** for easy event discrimination
- **Kind label utility** for UI display
- **Full compatibility with nostr-tools** (imported canonical Event type)
- **Source code in `src/` directory** for clean project structure

## API

### Types
- `Nip34Event` — Union of all NIP-34 event types
- `RepoAnnouncementEvent`, `RepoStateEvent`, `PatchEvent`, `IssueEvent`, `StatusEvent` — Strongly typed event kinds
- `NostrEvent` — Canonical event type from nostr-tools

### Utility Functions
- `isRepoAnnouncementEvent(event)`
- `isRepoStateEvent(event)`
- `isPatchEvent(event)`
- `isIssueEvent(event)`
- `isStatusEvent(event)`
- `getNip34KindLabel(kind)`

## Directory Structure

```
/packages/shared-types
  /src
    index.ts         # Barrel export
    nip34.ts         # NIP-34 event types
    utils.ts         # Type guards & helpers
  package.json
  tsconfig.json
  README.md
```

## License

MIT License
