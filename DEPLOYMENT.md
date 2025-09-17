# Deployment Guide

This guide covers build processes, deployment strategies, and CI/CD configuration for the Nostr-Git project.

## Build Process

### Production Builds

#### Build All Packages

```bash
# Clean previous builds
pnpm -r clean

# Build all packages in dependency order
pnpm build

# Verify build outputs
pnpm -r publint
```

#### Package-Specific Builds

```bash
# Core library
cd packages/core
pnpm build          # TypeScript compilation
pnpm typecheck      # Type checking

# UI components
cd packages/ui
pnpm build          # Svelte compilation + CSS

# Browser extension
cd packages/extension
# Production builds (Chrome/Firefox)
pnpm build:chrome:prod
pnpm build:firefox:prod

# VSCode extension
cd packages/vscode-ngit
pnpm package        # Creates .vsix file
```

### Build Optimization

#### Bundle Analysis

```bash
# Analyze bundle sizes
pnpm -r run bundle-analyzer

# Check for duplicate dependencies
pnpm dedupe
```

#### Performance Optimization

- Tree-shaking enabled for all packages
- Dynamic imports for code splitting
- Minification in production builds
- Source maps for debugging

## Package Publishing

### NPM Packages

#### Manual Publishing

```bash
# Build and publish core library
cd packages/core
pnpm build
pnpm publish --access public

# Publish UI components
cd packages/ui
pnpm build
pnpm publish --access public
```

#### Automated Publishing with Changesets

```bash
# Create changeset
pnpm changeset

# Version packages
pnpm changeset version

# Publish to NPM
pnpm changeset publish
```

### Extension Stores

#### Chrome Web Store

```bash
# Build + zip for stores
cd packages/extension
pnpm release:zip   # Produces extension-chrome.zip and extension-firefox.zip in package dir

# Upload to Chrome Web Store Developer Dashboard
# https://chrome.google.com/webstore/devconsole
```

Notes:

- To hide the Debug option in the popup for release builds, set the compile-time flag:
  ```bash
  NOSTR_GIT_SHOW_DEBUG=false pnpm --filter nostr-github-extension build:chrome:prod
  ```
  The release:zip script can also be run with the env var to produce a debugless Chrome bundle.

#### VSCode Marketplace

```bash
# Package extension
cd packages/vscode-ngit
pnpm package

# Publish to marketplace
vsce publish

# Or publish manually via:
# https://marketplace.visualstudio.com/manage
```

## Environment Configuration

### Development Environment

```bash
# .env.development
NODE_ENV=development
DEBUG=nostr-git:*
NOSTR_RELAY_URL=wss://relay.damus.io
```

### Production Environment

```bash
# .env.production
NODE_ENV=production
NOSTR_RELAY_URL=wss://relay.nostr.band
LOG_LEVEL=error
```

### Extension Configuration

```javascript
// packages/extension/src/config.ts
export const config = {
  development: {
    relayUrls: ["wss://relay.damus.io"],
    debugMode: true,
  },
  production: {
    relayUrls: ["wss://relay.nostr.band", "wss://nos.lol", "wss://relay.damus.io"],
    debugMode: false,
  },
}
```

## CI/CD Pipeline

### GitHub Actions Workflow

#### Main Workflow (.github/workflows/ci.yml)

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Type check
        run: pnpm -r typecheck

      - name: Lint
        run: pnpm -r lint

      - name: Test
        run: pnpm -r test

      - name: Build
        run: pnpm build

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
        with:
          version: 8

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: "pnpm"
          registry-url: "https://registry.npmjs.org"

      - name: Install dependencies
        run: pnpm install

      - name: Build packages
        run: pnpm build

      - name: Create Release Pull Request or Publish
        uses: changesets/action@v1
        with:
          publish: pnpm changeset publish
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### Extension Publishing Workflow

```yaml
name: Publish Extensions

on:
  release:
    types: [published]

jobs:
  publish-chrome-extension:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: "pnpm"

      - name: Build extension
        run: |
          cd packages/extension
          pnpm install
          pnpm build:chrome:prod
          pnpm zip:chrome

      - name: Publish to Chrome Web Store
        uses: PlasmoHQ/bpp@v3
        with:
          keys: ${{ secrets.CHROME_EXTENSION_KEYS }}
          artifact: packages/extension/dist

  publish-vscode-extension:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: "pnpm"

      - name: Build and publish VSCode extension
        run: |
          cd packages/vscode-ngit
          pnpm install
          pnpm package
          npx vsce publish --pat ${{ secrets.VSCODE_PAT }}
```

### Required Secrets

#### GitHub Repository Secrets

```bash
# NPM publishing
NPM_TOKEN=npm_xxxxxxxxxxxx

# Chrome Web Store
CHROME_EXTENSION_KEYS={"key": "...", "clientId": "...", "clientSecret": "...", "refreshToken": "..."}

# VSCode Marketplace
VSCODE_PAT=xxxxxxxxxxxxxxxx
```

## Monitoring and Logging

### Application Monitoring

#### Error Tracking

```typescript
// packages/core/src/lib/logger.ts
export class Logger {
  error(message: string, error?: Error, context?: object) {
    console.error(`[nostr-git] ${message}`, {error, context})

    // Send to error tracking service in production
    if (process.env.NODE_ENV === "production") {
      // Sentry, LogRocket, etc.
    }
  }
}
```

#### Performance Monitoring

```typescript
// Performance tracking for critical operations
export async function trackOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const start = performance.now()
  try {
    const result = await operation()
    const duration = performance.now() - start
    logger.debug(`Operation ${name} completed`, {duration})
    return result
  } catch (error) {
    const duration = performance.now() - start
    logger.error(`Operation ${name} failed`, error, {duration})
    throw error
  }
}
```

### Extension Monitoring

#### Chrome Extension Analytics

```javascript
// packages/extension/src/analytics.ts
export function trackEvent(event: string, properties?: object) {
  if (process.env.NODE_ENV === 'production') {
    // Google Analytics 4 or similar
    gtag('event', event, properties);
  }
}
```

#### VSCode Extension Telemetry

```typescript
// packages/vscode-ngit/src/telemetry.ts
import * as vscode from "vscode"

export function trackCommand(command: string) {
  // VSCode built-in telemetry
  vscode.env.telemetryLevel !== vscode.TelemetryLevel.Off &&
    console.log(`Command executed: ${command}`)
}
```

## Security Considerations

### Build Security

#### Dependency Scanning

```bash
# Audit dependencies
pnpm audit

# Check for known vulnerabilities
pnpm -r exec npm audit --audit-level high
```

#### Supply Chain Security

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  schedule:
    - cron: "0 0 * * 0" # Weekly
  push:
    branches: [main]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

### Extension Security

#### Content Security Policy

```json
// packages/extension/manifest.json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  "permissions": ["activeTab", "storage"]
}
```

#### Secure Communication

```typescript
// Secure message passing between contexts
export interface SecureMessage {
  type: string
  payload: unknown
  timestamp: number
  signature?: string // For sensitive operations
}
```

## Rollback Procedures

### NPM Package Rollback

```bash
# Unpublish specific version (within 24 hours)
npm unpublish @nostr-git/core@1.2.3

# Deprecate version
npm deprecate @nostr-git/core@1.2.3 "Security vulnerability, use 1.2.4+"
```

### Extension Rollback

```bash
# Chrome Web Store: Use developer dashboard to rollback
# VSCode Marketplace: Unpublish via marketplace portal

# Emergency: Remove from stores and notify users
```

### Git Tag Management

```bash
# Remove problematic release tag
git tag -d v1.2.3
git push origin :refs/tags/v1.2.3

# Create hotfix release
git checkout -b hotfix/v1.2.4
# Make fixes
git tag v1.2.4
git push origin v1.2.4
```

## Performance Optimization

### Build Performance

```bash
# Parallel builds
pnpm -r --parallel build

# Incremental TypeScript compilation
tsc --build --incremental

# Cache optimization
pnpm store path  # Check store location
pnpm store prune # Clean unused packages
```

### Runtime Performance

- Lazy loading for extensions
- Web Workers for heavy operations
- Efficient event handling patterns
- Memory leak prevention

## Troubleshooting

### Common Build Issues

#### TypeScript Compilation Errors

```bash
# Clear TypeScript cache
pnpm -r exec tsc --build --clean
rm -rf packages/*/dist

# Rebuild with verbose output
pnpm build --verbose
```

#### Extension Build Failures

```bash
# Clear extension build cache
cd packages/extension
rm -rf dist node_modules/.cache
pnpm install
pnpm build:prod
```

#### Publishing Failures

```bash
# Check package.json exports
pnpm publint

# Verify authentication
npm whoami
npm config get registry

# Test publish (dry run)
npm publish --dry-run
```

This deployment guide provides comprehensive coverage of build processes, CI/CD setup, and operational procedures for the Nostr-Git project.
