# Development Guide

This guide covers local development setup, workflows, and best practices for the Nostr-Git project.

## Prerequisites

### Required Software
- **Node.js**: Version 18.0.0 or higher
- **pnpm**: Version 8.0.0 or higher (preferred package manager)
- **Git**: Version 2.30.0 or higher
- **VSCode**: Recommended IDE with extensions

### Recommended VSCode Extensions
- **Svelte for VS Code**: Svelte language support
- **TypeScript and JavaScript**: Enhanced TypeScript support
- **Prettier**: Code formatting
- **ESLint**: Code linting
- **Tailwind CSS IntelliSense**: TailwindCSS support

## Initial Setup

### 1. Clone and Install
```bash
# Clone the repository
git clone https://github.com/your-org/nostr-git.git
cd nostr-git

# Install dependencies for all packages
pnpm install

# Verify installation
pnpm --version
node --version
```

### 2. Build All Packages
```bash
# Build all packages in dependency order
pnpm build

# Verify builds completed successfully
ls packages/*/dist
```

### 3. Verify Setup
```bash
# Run type checking across all packages
pnpm -r typecheck

# Run linting
pnpm -r lint

# Run formatting check
pnpm -r format
```

## Development Workflow

### Starting Development
```bash
# Start all packages in watch mode
pnpm watch:all

# Or start specific packages
pnpm watch:core      # Core library only
pnpm watch:ui        # UI components only
pnpm watch:shared-types  # Types package only
```

### Working with Storybook
```bash
# Start Storybook for UI development
cd packages/storybook
pnpm storybook

# Storybook will be available at http://localhost:6006
```

### Package-Specific Development
```bash
# Work on core library
cd packages/core
pnpm watch          # TypeScript compilation in watch mode
pnpm typecheck      # Type checking
pnpm test           # Run tests

# Work on UI components
cd packages/ui
pnpm watch          # Svelte compilation + CSS copying
pnpm build          # Production build
```

## Environment Configuration

### Environment Variables
Create a `.env.local` file in the project root:

```bash
# Development environment
NODE_ENV=development

# Nostr relay configuration (optional for development)
NOSTR_RELAY_URL=wss://relay.example.com

# Git provider configuration
GIT_PROVIDER=isogit

# Debug logging
DEBUG=nostr-git:*
```

### Package-Specific Configuration

#### Core Package
- Uses `tsconfig.json` for TypeScript compilation
- ESM modules with `.js` extensions in imports
- Web Workers for background Git operations

#### UI Package
- Svelte 5 with runes API
- TailwindCSS with custom preset
- PostCSS for CSS processing

#### Extensions
- Manifest V3 for browser extension
- VSCode extension API for IDE integration

## Testing

### Running Tests
```bash
# Run all tests
pnpm -r test

# Run tests for specific package
cd packages/core
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm test --coverage
```

### Test Structure
```
packages/core/
├── src/
│   ├── lib/
│   │   ├── event.ts
│   │   └── event.test.ts     # Unit tests
│   └── __tests__/
│       └── integration.test.ts  # Integration tests
```

### Writing Tests
```typescript
// Unit test example
import { describe, it, expect } from 'vitest';
import { createRepoEvent } from './event.js';

describe('createRepoEvent', () => {
  it('should create valid repo announcement event', () => {
    const repo = { name: 'test-repo', url: 'https://github.com/test/repo' };
    const event = createRepoEvent(repo);
    
    expect(event.kind).toBe(30617);
    expect(event.tags).toContainEqual(['r', repo.url]);
  });
});
```

## Debugging

### Browser Extension Debugging
```bash
# Build extension in development mode
cd packages/extension
pnpm build:dev

# Load unpacked extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select packages/extension/dist
```

### VSCode Extension Debugging
```bash
# Open extension in development mode
cd packages/vscode-ngit
code .

# Press F5 to launch Extension Development Host
# Set breakpoints in TypeScript files
```

### Core Library Debugging
```typescript
// Enable debug logging
import { logger } from './logger.js';

logger.debug('Processing event', { eventId: event.id });
```

## Common Development Tasks

### Adding a New Package
```bash
# Create package directory
mkdir packages/new-package
cd packages/new-package

# Initialize package.json
pnpm init

# Add to workspace (automatic with pnpm)
# Update root package.json workspaces if needed
```

### Adding Dependencies
```bash
# Add dependency to specific package
pnpm --filter @nostr-git/core add lodash

# Add dev dependency
pnpm --filter @nostr-git/ui add -D @types/node

# Add dependency to root (for tooling)
pnpm add -D -w prettier
```

### Cross-Package Dependencies
```bash
# Link local packages
pnpm --filter @nostr-git/ui add @nostr-git/shared-types

# This creates a workspace link automatically
```

## Build and Release

### Building for Production
```bash
# Clean all build artifacts
pnpm -r clean

# Build all packages
pnpm build

# Verify build outputs
pnpm -r publint  # Check package.json exports
```

### Publishing Packages
```bash
# Build and publish specific package
cd packages/core
pnpm build
pnpm publish --access public

# Publish all changed packages (using changeset)
pnpm changeset
pnpm changeset version
pnpm changeset publish
```

## Troubleshooting

### Common Issues

#### TypeScript Compilation Errors
```bash
# Clear TypeScript cache
pnpm -r exec tsc --build --clean

# Rebuild all packages
pnpm build
```

#### Package Resolution Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules packages/*/node_modules
pnpm install
```

#### Storybook Build Failures
```bash
# Clear Storybook cache
cd packages/storybook
rm -rf node_modules/.cache
pnpm storybook
```

#### Extension Loading Issues
```bash
# Rebuild extension
cd packages/extension
pnpm clean
pnpm build

# Check manifest.json syntax
pnpm validate-manifest
```

### Performance Issues

#### Slow TypeScript Compilation
- Use `--incremental` flag for faster rebuilds
- Consider using `tsc --build` for project references
- Enable `skipLibCheck` in development

#### Large Bundle Sizes
- Use `pnpm bundle-analyzer` to identify large dependencies
- Enable tree-shaking in build configuration
- Use dynamic imports for code splitting

### Development Server Issues

#### Port Conflicts
```bash
# Check for processes using ports
lsof -i :6006  # Storybook
lsof -i :3000  # Development server

# Kill processes if needed
kill -9 <PID>
```

#### File Watching Issues
```bash
# Increase file watcher limits (macOS/Linux)
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## Git Workflow

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring

### Commit Messages
Follow conventional commits format:
```
type(scope): description

feat(core): add patch creation functionality
fix(ui): resolve component rendering issue
docs(readme): update installation instructions
```

### Pre-commit Hooks
```bash
# Install pre-commit hooks
pnpm prepare

# Hooks will run:
# - ESLint
# - Prettier
# - TypeScript type checking
# - Unit tests
```

This development guide should help you get up and running with the Nostr-Git project efficiently.

---

## Package: @nostr-git/git-wrapper

The git-wrapper package implements the TypeScript ngit provider over Nostr (NIP-34) and a pluggable Git backend.

### Build and Test

```bash
# From repo root
pnpm -w --filter @nostr-git/git-wrapper build
pnpm -w --filter @nostr-git/git-wrapper test
```

### Protocol Preference Stores

Persist preferred clone/push URLs per `repoId`. Three adapters are available:

- Memory (default; ephemeral)
- File-backed (Node)
- localStorage (browser)

#### Node (File-backed)

```ts
import { NostrGitProvider } from '@nostr-git/git-wrapper/src/nostr-git-provider.js';
import { FileProtocolPrefs } from '@nostr-git/git-wrapper/src/prefs-store.js';
import fs from 'node:fs';

const provider = new NostrGitProvider(git, nostr);
provider.configureProtocolPrefsStore(new FileProtocolPrefs(fs, `${process.cwd()}/.ngit/prefs.json`));
```

#### Browser (localStorage)

```ts
import { LocalStorageProtocolPrefs } from '@nostr-git/git-wrapper/src/prefs-store.js';

const provider = new NostrGitProvider(git, nostr);
provider.configureProtocolPrefsStore(new LocalStorageProtocolPrefs(window.localStorage));
```

### Repo Address Helpers

Always construct repo addresses via the helper for consistency:

```ts
import { makeRepoAddr, isRepoAddr } from '@nostr-git/git-wrapper/src/repo-addr.js';

const repoAddr = makeRepoAddr(ownerPubkey, repoId);
console.assert(isRepoAddr(repoAddr));
```

### Unified Diff in Patch Content

By providing `{ fs, dir }` and refs (e.g., `baseBranch` and the PR ref), the default patch content generator will append a lightweight unified diff generated by isomorphic-git.

