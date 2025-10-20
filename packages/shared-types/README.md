# @nostr-git/shared-types

Shared TypeScript types and constants for Git/Nostr event structures, providing type-safe interfaces for NIP-34 Git collaboration events.

## 🎯 Purpose

This package provides comprehensive TypeScript definitions for all Git-related Nostr events, ensuring type safety across the entire Nostr-Git ecosystem while maintaining full compatibility with [nostr-tools](https://github.com/nbd-wtf/nostr-tools).

## ✨ Features

### Event Type Definitions

- **Repository Events**: Types for repository announcements (kind 30617) and state events (kind 30618)
- **Patch Events**: Strongly typed patch events (kind 1617) with Git diff structures
- **Issue Events**: Issue tracking event types (kind 1621) for decentralized bug reporting
- **Pull Request Events**: Pull request creation (kind 1618) and update events (kind 1619)
- **User Grasp Lists**: User grasp service discovery events (kind 10317)
- **Status Events**: Repository status and metadata event types

### Type Safety Features

- **Discriminated Unions**: Type-safe event discrimination with TypeScript
- **Type Guards**: Runtime type checking functions for event validation
- **Utility Types**: Helper types for common Git/Nostr patterns
- **Constant Definitions**: All NIP-34 event kind constants

### Compatibility

- **nostr-tools Integration**: Full compatibility with canonical Nostr types
- **Zero Dependencies**: Pure TypeScript definitions with no runtime dependencies
- **ESM Support**: Modern ES module exports with proper TypeScript declarations

## 📦 Installation

```bash
# Using pnpm (recommended)
pnpm add @nostr-git/shared-types

# Using npm
npm install @nostr-git/shared-types

# Using yarn
yarn add @nostr-git/shared-types
```

## 🚀 Quick Start

### Basic Type Usage

```typescript
import type {NostrEvent, GitRepoEvent, GitPatchEvent, GitIssueEvent, PullRequestEvent, PullRequestUpdateEvent, UserGraspListEvent} from "@nostr-git/shared-types"

// Type-safe event handling
function handleGitEvent(event: NostrEvent) {
  switch (event.kind) {
    case 30617: // Repository announcement
      const repoEvent = event as GitRepoEvent
      // Prefer canonical helpers over direct tag access
      import {getTagValue} from "@nostr-git/shared-types"
      console.log(`Repository: ${getTagValue(repoEvent, "name")}`)
      break

    case 1617: // Patch event
      const patchEvent = event as GitPatchEvent
      console.log(`Patch: ${patchEvent.content}`)
      break

    case 1621: // Issue event
      const issueEvent = event as GitIssueEvent
      console.log(`Issue: ${issueEvent.content}`)
      break

    case 1618: // Pull Request event
      const prEvent = event as PullRequestEvent
      console.log(`Pull Request: ${prEvent.content}`)
      break

    case 1619: // Pull Request Update event
      const prUpdateEvent = event as PullRequestUpdateEvent
      console.log(`PR Update: ${prUpdateEvent.id}`)
      break

    case 10317: // User Grasp List event
      const graspEvent = event as UserGraspListEvent
      console.log(`Grasp Services: ${graspEvent.tags.length}`)
      break
  }
}
```

### Using Type Guards

```typescript
import {isRepoAnnouncementEvent, isPatchEvent, isIssueEvent, isPullRequestEvent, isPullRequestUpdateEvent, isUserGraspListEvent} from "@nostr-git/shared-types"

function processEvent(event: NostrEvent) {
  if (isRepoAnnouncementEvent(event)) {
    // TypeScript knows this is a GitRepoEvent
    console.log("Repository:", event.tags)
  } else if (isPatchEvent(event)) {
    // TypeScript knows this is a GitPatchEvent
    console.log("Patch content:", event.content)
  } else if (isIssueEvent(event)) {
    // TypeScript knows this is a GitIssueEvent
    console.log("Issue:", event.content)
  } else if (isPullRequestEvent(event)) {
    // TypeScript knows this is a PullRequestEvent
    console.log("Pull Request:", event.content)
  } else if (isPullRequestUpdateEvent(event)) {
    // TypeScript knows this is a PullRequestUpdateEvent
    console.log("PR Update:", event.id)
  } else if (isUserGraspListEvent(event)) {
    // TypeScript knows this is a UserGraspListEvent
    console.log("Grasp Services:", event.tags.length)
  }
}
```

### Event Kind Constants

```typescript
import {GIT_REPO_ANNOUNCEMENT, GIT_REPO_STATE, GIT_PATCH, GIT_ISSUE, GIT_PULL_REQUEST, GIT_PULL_REQUEST_UPDATE, GIT_USER_GRASP_LIST} from "@nostr-git/shared-types"

// Use constants instead of magic numbers
const repoEvent = {
  kind: GIT_REPO_ANNOUNCEMENT, // 30617
  content: JSON.stringify({name: "my-repo"}),
  // ... other event properties
}

const prEvent = {
  kind: GIT_PULL_REQUEST, // 1618
  content: "PR description",
  // ... other event properties
}

const graspEvent = {
  kind: GIT_USER_GRASP_LIST, // 10317
  content: "",
  // ... other event properties
}
```

## 📚 API Reference

### Core Types

#### `NostrEvent`

Canonical Nostr event type from nostr-tools.

```typescript
interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}
```

#### `GitRepository`

Repository metadata structure.

```typescript
interface GitRepository {
  name: string
  url: string
  description?: string
  maintainers: string[]
  defaultBranch?: string
}
```

#### `GitPatch`

Git patch structure with metadata.

```typescript
interface GitPatch {
  title: string
  description?: string
  diff: string
  commits: GitCommit[]
  repoUrl: string
  targetBranch?: string
}
```

### Event Types

#### Repository Events

- `GitRepoEvent` - Repository announcement event (kind 30617)
- `GitRepoStateEvent` - Repository state event (kind 30618)

#### Collaboration Events

- `GitPatchEvent` - Patch submission event (kind 1617)
- `GitIssueEvent` - Issue creation event (kind 1621)
- `PullRequestEvent` - Pull request creation event (kind 1618)
- `PullRequestUpdateEvent` - Pull request update event (kind 1619)
- `UserGraspListEvent` - User grasp service discovery event (kind 10317)

### Type Guards

#### Event Type Checking

```typescript
// Repository events
isRepoAnnouncementEvent(event: NostrEvent): event is GitRepoEvent
isRepoStateEvent(event: NostrEvent): event is GitRepoStateEvent

// Collaboration events
isPatchEvent(event: NostrEvent): event is GitPatchEvent
isIssueEvent(event: NostrEvent): event is GitIssueEvent
isPullRequestEvent(event: NostrEvent): event is PullRequestEvent
isPullRequestUpdateEvent(event: NostrEvent): event is PullRequestUpdateEvent
isUserGraspListEvent(event: NostrEvent): event is UserGraspListEvent

// Generic Git event check
isGitEvent(event: NostrEvent): event is GitEvent
```

### Utility Functions

#### Event Kind Labels

```typescript
// Get human-readable labels for event kinds
getNostrKindLabel(kind: number): string

// Examples:
getNostrKindLabel(30617) // "Repository Announcement"
getNostrKindLabel(1617)  // "Patch"
getNostrKindLabel(1621)  // "Issue"
getNostrKindLabel(1618)  // "Pull Request"
getNostrKindLabel(1619)  // "Pull Request Update"
getNostrKindLabel(10317) // "User Grasp List"
```

### Canonical Tag Helpers

Use these helpers instead of direct `tags.find`/`tags.filter` when extracting tag data from events. This ensures consistent behavior across packages and centralizes tag parsing logic.

```typescript
import {getTag, getTagValue, getTags} from "@nostr-git/shared-types"

// Get first tag tuple of a given type
const headRef = getTag(event, "HEAD")

// Get first value for a tag
const name = getTagValue(event, "name")

// Check presence
const isSigned = !!getTagValue(event, "commit-pgp-sig")

// List of tags of a given type
const reviewers = getTags(event, "p") // string[][] of [type, value, ...]
const reviewerCount = reviewers.length
```

## 🆕 New NIP-34 Features

### Pull Request Events

Pull Request events enable decentralized code review and collaboration workflows:

```typescript
import {createPullRequestEvent, parsePullRequestEvent, validatePullRequestEvent} from "@nostr-git/shared-types"

// Create a pull request event
const prEvent = createPullRequestEvent({
  repoAddr: "30617:my-repo",
  recipients: ["reviewer1-pubkey", "reviewer2-pubkey"],
  subject: "Add new feature",
  labels: ["enhancement", "frontend"],
  commits: ["abc123", "def456"],
  clone: ["https://github.com/user/repo"],
  branchName: "feature-branch",
  mergeBase: "main-commit-hash",
  content: "This PR adds a new feature...",
})

// Parse and validate
const parsed = parsePullRequestEvent(prEvent)
const validation = validatePullRequestEvent(prEvent)
```

### Pull Request Updates

Track changes to existing pull requests:

```typescript
import {createPullRequestUpdateEvent, parsePullRequestUpdateEvent} from "@nostr-git/shared-types"

const prUpdateEvent = createPullRequestUpdateEvent({
  repoAddr: "30617:my-repo",
  recipients: ["reviewer-pubkey"],
  commits: ["new-commit-hash"],
  clone: ["https://github.com/user/repo"],
  mergeBase: "updated-base-commit",
})
```

### User Grasp Lists

Discover and share grasp service endpoints:

```typescript
import {createUserGraspListEvent, parseUserGraspListEvent} from "@nostr-git/shared-types"

const graspEvent = createUserGraspListEvent({
  services: [
    "https://grasp.example.com",
    "https://grasp2.example.com"
  ]
})

const parsed = parseUserGraspListEvent(graspEvent)
console.log("Available services:", parsed.services)
```

## 🏗️ Architecture

The package is organized for maximum type safety and developer experience:

```
src/
├── index.ts          # Barrel exports for all public APIs
├── nip34.ts          # NIP-34 event type definitions and constants
├── utils.ts          # Type guards and utility functions
├── git-types.ts      # Git-specific type definitions
└── nostr-types.ts    # Nostr protocol type extensions
```

### Design Principles

- **Zero Runtime Dependencies**: Pure TypeScript definitions
- **Strict Type Safety**: Discriminated unions and type guards
- **Compatibility First**: Works seamlessly with nostr-tools
- **Developer Experience**: Clear, self-documenting types

## 🔧 Configuration

### TypeScript Configuration

This package requires TypeScript 4.7+ for proper discriminated union support:

```json
{
  "compilerOptions": {
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### ESM Imports

All imports use `.js` extensions for ESM compatibility:

```typescript
// ✅ Correct
import type {GitEvent} from "./nip34.js"

// ❌ Incorrect
import type {GitEvent} from "./nip34"
```

## 🧪 Testing

```bash
# Run type tests
pnpm test

# Type checking only
pnpm typecheck

# Build and validate exports
pnpm build
```

## 🤝 Contributing

See the main project's [DEVELOPMENT.md](../../DEVELOPMENT.md) for development setup and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for code style guidelines.

### Adding New Types

1. **Define the type** in the appropriate file (`nip34.ts`, `git-types.ts`)
2. **Add type guards** in `utils.ts` if needed
3. **Export from index.ts** for public API
4. **Add tests** to verify type safety
5. **Update documentation** with examples

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.

```

## License

MIT License
```
