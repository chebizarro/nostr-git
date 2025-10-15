# @nostr-git/ui

Svelte 5 component library with TailwindCSS for rendering Git and Nostr UI elements in modern web applications.

## 🎯 Purpose

Provides a comprehensive set of reusable Svelte components for building Git-aware applications on the Nostr protocol, with a focus on accessibility, performance, and developer experience.

## ✨ Features

### Git Components

- **Repository Cards**: Display repository information with metadata and actions
- **Commit Viewers**: Render commit details with diff visualization
- **Branch Selectors**: Interactive branch switching and management
- **Patch Viewers**: Display Git patches with syntax highlighting
- **Issue Trackers**: Show and manage Git issues as Nostr events

### Nostr Components

- **Event Cards**: Render various Nostr event types with proper formatting
- **Publish Buttons**: One-click publishing to Nostr relays
- **Relay Status**: Show connection status and relay health
- **Key Management**: Secure private key input and management

### UI Primitives

- **Form Controls**: Accessible input components with validation
- **Navigation**: Breadcrumbs, tabs, and routing components
- **Feedback**: Toast notifications, loading states, and error displays
- **Layout**: Responsive grid and container components

### Styling Features

- **TailwindCSS Integration**: Custom preset with Git/Nostr design tokens
- **Dark Mode Support**: Automatic theme switching
- **Responsive Design**: Mobile-first responsive components
- **Accessibility**: ARIA attributes and keyboard navigation

## 📦 Installation

```bash
# Using pnpm (recommended)
pnpm add @nostr-git/ui

# Using npm
npm install @nostr-git/ui

# Using yarn
yarn add @nostr-git/ui
```

### Peer Dependencies

```bash
# Required peer dependencies
pnpm add svelte@^5.28.2
```

## 🚀 Quick Start

### Basic Setup

```svelte
<script lang="ts">
  import { RepoCard, PatchViewer } from "@nostr-git/ui";
  import type { NostrEvent } from "@nostr-git/shared-types";

  let repoEvent: NostrEvent;
  let patchEvent: NostrEvent;
</script>

<RepoCard event={repoEvent} />
<PatchViewer event={patchEvent} />
```

### TailwindCSS Configuration

Add the UI preset to your `tailwind.config.js`:

```javascript
// tailwind.config.js
import { preset } from "@nostr-git/ui/tailwind.preset.js";

export default {
  presets: [preset],
  content: ["./src/**/*.{html,js,svelte,ts}", "./node_modules/@nostr-git/ui/**/*.{js,svelte,ts}"],
};
```

### CSS Import

```css
/* app.css */
@import "@nostr-git/ui/index.css";
```

### Advanced Usage with Runes

```svelte
<script lang="ts">
  import { EventPublisher, RepoSelector } from "@nostr-git/ui";
  import type { GitRepository } from "@nostr-git/shared-types";

  // Svelte 5 runes for reactive state
  let selectedRepo = $state<GitRepository | null>(null);
  let isPublishing = $state(false);

  // Derived state
  const canPublish = $derived(selectedRepo && !isPublishing);

  function handleRepoSelect(repo: GitRepository) {
    selectedRepo = repo;
  }

  async function handlePublish() {
    if (!selectedRepo) return;

    isPublishing = true;
    try {
      await publishRepoEvent(selectedRepo);
    } finally {
      isPublishing = false;
    }
  }
</script>

<RepoSelector onselect={handleRepoSelect} />

{#if selectedRepo}
  <EventPublisher repo={selectedRepo} disabled={!canPublish} onpublish={handlePublish} />
{/if}
```

## 📚 Component Reference

For detailed component documentation, see:

- [API Reference](API_REFERENCE.md) - Complete component API
- [Architecture Guide](ARCHITECTURE.md) - Component design patterns
- [Storybook](../storybook/) - Interactive component examples

### Key Components

#### Repository Components

- `RepoCard` - Repository information display
- `RepoSelector` - Repository picker with search
- `CloneRepository` - Repository cloning interface
- `ForkRepository` - Repository forking workflow

#### Git Components

- `CommitViewer` - Commit details and diff display
- `PatchViewer` - Git patch visualization
- `BranchSelector` - Branch switching interface
- `MergeConflictResolver` - Conflict resolution UI

#### Nostr Components

- `EventCard` - Generic Nostr event display
- `PublishButton` - Event publishing interface
- `RelayStatus` - Relay connection indicator
- `KeyManager` - Private key management

## 🎨 Theming

### Custom Theme

```css
/* Custom CSS properties */
:root {
  --color-primary: #8b5cf6;
  --color-primary-foreground: #ffffff;
  --color-secondary: #6b7280;
  --color-accent: #10b981;
  --color-destructive: #ef4444;
}
```

### Dark Mode

```svelte
<script>
  import { ThemeProvider } from "@nostr-git/ui";
</script>

<ThemeProvider theme="dark">
  <!-- Your app content -->
</ThemeProvider>
```

## 🏗️ Architecture

The UI package follows these design principles:

- **Composition over Inheritance**: Components are composed from smaller primitives
- **Accessibility First**: All components include proper ARIA attributes
- **Performance Optimized**: Lazy loading and efficient re-rendering
- **Type Safe**: Full TypeScript support with proper prop types

```
src/lib/
├── components/
│   ├── git/              # Git-specific components
│   ├── nostr/            # Nostr-specific components
│   ├── ui/               # Generic UI primitives
│   └── forms/            # Form components
├── stores/               # Svelte stores for state management
├── utils/                # Utility functions
└── styles/               # TailwindCSS configurations
```

## 🧪 Development

### Local Development

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm watch

# Build components
pnpm build

# Run Storybook
cd ../storybook
pnpm storybook
```

### Testing Components

```bash
# Run component tests
pnpm test

# Test with coverage
pnpm test --coverage

# Visual regression testing
pnpm test:visual
```

## 🧩 RepoCore (Testable Core) and Repo Getters

This UI package includes a testable core for Git/Nostr repo features, decoupled from Svelte runes, plus a reactive Repo class for UI consumption.

- Core module: `@nostr-git/core` RepoCore class
  - `trustedMaintainers(ctx)`
  - `mergeRepoStateByMaintainers(ctx, events)` — merges trusted 30618 refs; includes legacy `r` tag pair fallback
  - `getPatchGraph(ctx)` returns:
    - `nodes: Map<string, PatchEvent>`
    - `roots: string[]`, `rootRevisions: string[]`
    - `edgesCount: number`, `topParents: string[]`
    - `parentOutDegree: Record<string, number>`, `parentChildren: Record<string, string[]>`
  - `resolveStatusFor(ctx, rootId)` — trust/author precedence; maps NIP-163x kinds to UI states
  - `getIssueThread(ctx, rootId)` — NIP-22 comments
  - Labels: `getEffectiveLabelsFor`, `getIssueLabels`, `getPatchLabels`, `getRepoLabels`
  - `getMaintainerBadge(ctx, pubkey)` — 'owner' | 'maintainer' | null

- Reactive Repo class: `src/lib/components/git/Repo.svelte.ts`
  - Mirrors `getPatchGraph()` fields for UI
  - Caches invalidate on repo event/state changes and on patch set changes
  - Delegates core logic to RepoCore (preserving caches):
    - `mergeRepoStateByMaintainers()`, `getPatchGraph()`, `resolveStatusFor()`
    - `getIssueThread()`, `getEffectiveLabelsFor()` and label helpers
    - `getMaintainerBadge()`, `getRecommendedFilters()`
  - The class builds a `RepoContext` snapshot and passes it to RepoCore functions

### Focused UI Repo tests

Run the focused Repo tests from the workspace root:

```bash
pnpm -w test:repo
```

This uses a dedicated Vitest config to run `packages/nostr-git/packages/ui/tests/Repo.spec.ts` with:

- jsdom environment and setup (`vitest.repo.config.ts`, `vitest.setup.ts`)
- Stubs for `$lib/stores/context|tokens|toast`
- Polyfills (`fake-indexeddb`, `self`)

### UI Components related

- `src/lib/components/StatusChip.svelte` — resolved/raw status with reason tooltip
- `src/lib/components/MaintainerBadge.svelte` — displays owner/maintainer role
- `src/lib/components/PatchDagSummary.svelte` — DAG summary: nodes, edges, roots, top parents; hover shows up to 3 child IDs (truncated)

## 🔧 Configuration

### Build Configuration

The package uses `@sveltejs/package` for building:

```javascript
// svelte.config.js
import { sveltekit } from "@sveltejs/kit/vite";

export default {
  kit: {
    package: {
      exports: (filepath) => {
        return filepath.endsWith(".svelte") || filepath.endsWith(".js");
      },
    },
  },
};
```

## 🤝 Contributing

See the main project's [DEVELOPMENT.md](../../DEVELOPMENT.md) for development setup and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for code style guidelines.

### Component Development Guidelines

1. **Props Interface**: Always define a clear Props interface
2. **Accessibility**: Include proper ARIA attributes
3. **Responsive**: Design mobile-first with responsive breakpoints
4. **Documentation**: Add Storybook stories for all components
5. **Testing**: Write comprehensive component tests

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
