# @nostr-git/core

Core TypeScript library for creating, parsing, and publishing Git-related Nostr events following the NIP-34 specification.

## 🎯 Purpose

This package provides the foundational functionality for integrating Git workflows with the Nostr protocol, enabling decentralized code collaboration without centralized platforms.

## ✨ Features

### Event Creation
- **Repository Events**: Create NIP-34 repository announcements (kind 30617) and state events (kind 30618)
- **Patch Events**: Generate patch events (kind 1617) from Git diffs and commits
- **Issue Events**: Create issue tracking events (kind 1621) for decentralized bug reporting
- **Code Snippets**: Generate NIP-95 code snippet events with syntax highlighting

### Git Operations
- **Repository Management**: Clone, fork, and manage Git repositories
- **Patch Processing**: Create, parse, and apply Git patches
- **Merge Analysis**: Analyze merge conflicts and compatibility
- **Branch Operations**: List, create, and manage repository branches

### Nostr Integration
- **Event Publishing**: Publish events to multiple Nostr relays
- **Event Parsing**: Parse and validate incoming Git-related events
- **Relay Management**: Handle relay connections and subscriptions
- **Permalink Encoding**: Convert GitHub/GitLab URLs to Nostr-compatible permalinks

### Performance Features
- **Web Workers**: Background processing for heavy Git operations
- **Caching**: IndexedDB-based caching for repository data
- **Streaming**: Efficient handling of large repositories and patches

## 📦 Installation

```bash
# Using pnpm (recommended)
pnpm add @nostr-git/core

# Using npm
npm install @nostr-git/core

# Using yarn
yarn add @nostr-git/core
```

## 🚀 Quick Start

### Creating Repository Events

```typescript
import { createRepoEvent } from '@nostr-git/core';

const repo = {
  name: 'my-awesome-project',
  url: 'https://github.com/user/my-awesome-project',
  description: 'A revolutionary new approach to coding',
  maintainers: ['npub1...']
};

const event = createRepoEvent(repo);
// Event needs to be signed before publishing
```

### Creating Patch Events

```typescript
import { createPatch } from '@nostr-git/core';

const result = await createPatch({
  repoPath: '/path/to/repository',
  fromCommit: 'abc123',
  toCommit: 'def456',
  title: 'Fix authentication bug',
  description: 'Resolves issue with special characters in passwords'
});

if (result.success) {
  const patchEvent = createPatchEvent(result.data);
}
```

### Using Web Workers

```typescript
import { getGitWorker } from '@nostr-git/core';

const { api, worker } = getGitWorker((progress) => {
  console.log(`Progress: ${progress.percentage}%`);
});

// Perform heavy operations in background
const result = await api.cloneAndFork({
  url: 'https://github.com/user/repo',
  targetDir: '/tmp/repo'
});

// Clean up when done
worker.terminate();
```

## 📚 API Reference

For comprehensive API documentation, see the main project's [API.md](../../API.md).

### Key Exports

- **Event Creation**: `createRepoEvent`, `createPatchEvent`, `createIssueEvent`
- **Git Operations**: `cloneRepository`, `createPatch`, `analyzeMerge`
- **Worker API**: `getGitWorker`, `GitWorkerClient`
- **Utilities**: `parsePermalink`, `encodePermalink`, `validateEvent`

## 🏗️ Architecture

The core package follows a modular architecture:

```
src/lib/
├── event.ts          # Nostr event creation and parsing
├── git.ts            # Git operations and repository management
├── patches.ts        # Patch creation and application
├── workers/          # Web Worker implementations
├── git/              # Git service provider APIs
└── utils/            # Utility functions and helpers
```

## 🔧 Configuration

### Environment Variables

```bash
# Debug logging
DEBUG=nostr-git:core

# Default relay URLs
NOSTR_RELAY_URLS=wss://relay.damus.io,wss://nos.lol

# Git provider tokens (optional)
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=glpat-...
```

### TypeScript Configuration

This package uses ESM modules with `.js` extensions in imports for compatibility:

```typescript
// ✅ Correct import format
import { createEvent } from './event.js';

// ❌ Incorrect - missing .js extension
import { createEvent } from './event';
```

## 🧪 Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

## 🔍 Debugging

Enable debug logging:

```bash
DEBUG=nostr-git:* pnpm test
```

## 🤝 Contributing

See the main project's [DEVELOPMENT.md](../../DEVELOPMENT.md) for development setup and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for code style guidelines.

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
