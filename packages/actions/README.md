# Nostr-Git GitHub Actions

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Nostr--Git-blue.svg?colorA=24292e&colorB=0366d6&style=flat&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4n3EW9+fDf3cRKlGbheTHWcdRU+4YolD9B1YuAjh/+3+chBpqqGqyKXKOyoRi4V0A9D+5Tq2T9HlZsmRAeZs+ioMpCrVQCBnd7gRQRi+5hRH3iCOBiIsr+BxXuAeZdM07M1m5+JbbGpCy+FhgFXgbmhoXa9J7+d2KfUa1P3WnHWYL1uYCNMVOgVsYlE+T+DnpDz1Rd+2nyGqY1TbYiB1rGHFNUUf+Oj/2HLgHHfwwDjbQKAJyxSA/8lXxhELPMHrNyOBAgTEQAAAABJRU5ErkJggg==)](https://github.com/marketplace/actions/nostr-git)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

GitHub Actions for automatically publishing Git events to the Nostr network, enabling decentralized repository announcements and collaboration workflows.

## 🎯 Purpose

These GitHub Actions automate the publishing of repository events, commits, issues, and releases to Nostr relays, creating a bridge between centralized Git platforms and the decentralized Nostr network.

## ✨ Features

### Automated Event Publishing

- **Repository Announcements**: Publish NIP-34 repository events (kind 30617) on repository creation or updates
- **Commit Events**: Share commit information and patches as Nostr events
- **Issue Events**: Publish GitHub issues as NIP-34 issue events (kind 1621)
- **Release Events**: Announce new releases to the Nostr network

### Flexible Triggers

- **Push Events**: Publish commits and patches on code pushes
- **Issue Events**: Share issues and discussions automatically
- **Release Events**: Announce new versions and releases
- **Custom Triggers**: Configure custom event publishing workflows

### Security & Configuration

- **Secure Key Management**: Use GitHub Secrets for private key storage
- **Multi-Relay Support**: Publish to multiple Nostr relays simultaneously
- **Event Filtering**: Configure which events to publish
- **Retry Logic**: Automatic retry for failed publications

## 📦 Available Actions

### Repository Announcement Action

Publishes repository metadata to Nostr when repository is created or updated.

### Commit Publisher Action

Shares commits and patches as Nostr events on push events.

### Issue Publisher Action

Publishes GitHub issues as decentralized Nostr events.

## 🚀 Quick Start

### Basic Repository Announcement

```yaml
name: Publish Repository to Nostr
on:
  push:
    branches: [main]
  repository_dispatch:
    types: [announce-repo]

jobs:
  announce-repo:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Announce repository to Nostr
        uses: nostr-git/actions/announce-repo@v1
        with:
          nostr_private_key: ${{ secrets.NOSTR_PRIVATE_KEY }}
          relays: |
            wss://relay.damus.io
            wss://nos.lol
            wss://relay.nostr.band
```

### Commit and Patch Publishing

```yaml
name: Publish Commits to Nostr
on:
  push:
    branches: [main, develop]

jobs:
  publish-commits:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Fetch full history for patch generation

      - name: Publish commits to Nostr
        uses: nostr-git/actions/publish-commits@v1
        with:
          nostr_private_key: ${{ secrets.NOSTR_PRIVATE_KEY }}
          relays: ${{ vars.NOSTR_RELAYS }}
          include_patches: true
          max_commits: 10
```

### Issue Publishing

```yaml
name: Publish Issues to Nostr
on:
  issues:
    types: [opened, edited, closed, reopened]

jobs:
  publish-issue:
    runs-on: ubuntu-latest
    steps:
      - name: Publish issue to Nostr
        uses: nostr-git/actions/publish-issue@v1
        with:
          nostr_private_key: ${{ secrets.NOSTR_PRIVATE_KEY }}
          relays: ${{ vars.NOSTR_RELAYS }}
          issue_number: ${{ github.event.issue.number }}
          action: ${{ github.event.action }}
```

### Complete Workflow

```yaml
name: Nostr Git Integration
on:
  push:
    branches: [main]
  issues:
    types: [opened, closed]
  release:
    types: [published]

jobs:
  publish-to-nostr:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Publish repository events
        uses: nostr-git/actions/publish-events@v1
        with:
          nostr_private_key: ${{ secrets.NOSTR_PRIVATE_KEY }}
          relays: |
            wss://relay.damus.io
            wss://nos.lol
            wss://relay.nostr.band
          events: |
            repo-announcement
            commits
            issues
            releases
```

## 🔧 Configuration

### Required Secrets

Add these secrets to your GitHub repository:

```bash
# Required: Nostr private key for signing events
NOSTR_PRIVATE_KEY=nsec1...

# Optional: Default relays (can also be specified in workflow)
NOSTR_RELAYS=wss://relay.damus.io,wss://nos.lol
```

### Action Inputs

#### Common Inputs (All Actions)

| Input               | Description                                   | Required | Default |
| ------------------- | --------------------------------------------- | -------- | ------- |
| `nostr_private_key` | Nostr private key (nsec format)               | ✅       | -       |
| `relays`            | Newline-separated list of relay URLs          | ✅       | -       |
| `timeout`           | Timeout for relay connections (seconds)       | ❌       | `30`    |
| `retry_attempts`    | Number of retry attempts for failed publishes | ❌       | `3`     |

#### Repository Announcement Inputs

| Input              | Description                                   | Required | Default |
| ------------------ | --------------------------------------------- | -------- | ------- |
| `include_metadata` | Include repository metadata (topics, license) | ❌       | `true`  |
| `include_stats`    | Include repository statistics                 | ❌       | `false` |

#### Commit Publisher Inputs

| Input             | Description                          | Required | Default |
| ----------------- | ------------------------------------ | -------- | ------- |
| `include_patches` | Generate and include patch data      | ❌       | `true`  |
| `max_commits`     | Maximum number of commits to process | ❌       | `20`    |
| `include_diffs`   | Include commit diffs in events       | ❌       | `true`  |

#### Issue Publisher Inputs

| Input              | Description                                | Required | Default |
| ------------------ | ------------------------------------------ | -------- | ------- |
| `issue_number`     | GitHub issue number                        | ✅       | -       |
| `action`           | GitHub issue action (opened, closed, etc.) | ✅       | -       |
| `include_comments` | Include issue comments                     | ❌       | `false` |

## 🏗️ Architecture

The actions are built using TypeScript and the GitHub Actions toolkit:

```
packages/actions/
├── announce-repo/           # Repository announcement action
├── publish-commits/         # Commit publishing action
├── publish-issue/          # Issue publishing action
├── shared/                 # Shared utilities and types
└── dist/                   # Compiled JavaScript output
```

### Key Components

- **Event Generators**: Create NIP-34 compliant Nostr events
- **Relay Publishers**: Handle publishing to multiple Nostr relays
- **GitHub API Integration**: Extract repository, commit, and issue data
- **Error Handling**: Robust error handling and retry logic

## 🔒 Security

### Private Key Management

- Store private keys in GitHub Secrets (never in code)
- Use environment variables for sensitive configuration
- Private keys are only used for event signing
- No private key logging or persistence

### Network Security

- WSS connections to Nostr relays
- Certificate validation for all connections
- Timeout and retry mechanisms for reliability

## 🧪 Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-org/nostr-git.git
cd nostr-git/packages/actions

# Install dependencies
pnpm install

# Build actions
pnpm build

# Run tests
pnpm test
```

### Testing Actions

```bash
# Unit tests
pnpm test:unit

# Integration tests (requires test repository)
pnpm test:integration

# Test with act (local GitHub Actions runner)
act push -s NOSTR_PRIVATE_KEY=nsec1...
```

## 🤝 Contributing

See the main project's [DEVELOPMENT.md](../../DEVELOPMENT.md) for development setup and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for code style guidelines.

### Action Development Guidelines

1. **GitHub Actions Best Practices**: Follow GitHub's action development guidelines
2. **Error Handling**: Provide clear error messages and proper exit codes
3. **Logging**: Use appropriate log levels for debugging and monitoring
4. **Testing**: Write comprehensive tests for all action logic
5. **Documentation**: Update README and action.yml files

## 📚 Examples

See the [examples](examples/) directory for complete workflow examples:

- [Basic Repository Publishing](examples/basic-repo.yml)
- [Advanced Commit Publishing](examples/advanced-commits.yml)
- [Issue and PR Integration](examples/issues-prs.yml)
- [Multi-Environment Setup](examples/multi-env.yml)

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
