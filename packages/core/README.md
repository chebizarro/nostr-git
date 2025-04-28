# @nostr-git/core

The core TypeScript library for working with Git events on the Nostr network.

## Features

- Create NIP-34 Git events (repo metadata, commits, issues, discussions)
- Create NIP-95 code snippet events
- Encode/decode GitHub permalinks
- Publish events to Nostr relays
- Parse GitHub metadata into Nostr event tags

## Installation

```bash
npm install @nostr-git/core
```

## Usage

```ts
import { createGitRepoEvent } from '@nostr-git/core';

const event = createGitRepoEvent({
  repoName: 'example-repo',
  description: 'A test repo',
  url: 'https://github.com/example/example-repo',
});
```

## License

MIT License
