# Nostr-Git VSCode Extension

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/nostr-git.vscode-ngit)](https://marketplace.visualstudio.com/items?itemName=nostr-git.vscode-ngit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

This is a Visual Studio Code extension for decentralized Git repository discovery and collaboration over Nostr.

## Features

- Discover Git repositories announced on Nostr (kind:30617)
- Announce your own repositories to the Nostr network
- List and interact with Nostr-based Pull Requests
- Integrate with `git-remote-nostr` for decentralized Git operations
- Custom explorer view for browsing Nostr repositories
- Multi-workspace folder support
- Progress notifications for long-running operations
- Context menu commands for copying clone and web URLs
- NIP-46 remote signing support

## Requirements

- VS Code 1.88+
- `ngit` CLI tool installed and in PATH
- `git-remote-nostr` installed

## Extension Settings

This extension contributes the following settings:

- `ngit-vscode.relayUrls`: Array of Nostr relay URLs to connect to
- `ngit-vscode.authorNpub`: Your Nostr public key (npub) for filtering

## Usage

1. **Discover Repositories**: The extension automatically discovers repositories announced on Nostr and displays them in the "Nostr Repos" explorer view.

2. **Announce Repository**: Use the "Nostr: Announce Repository" command to announce your local repository to the Nostr network.

3. **List PRs**: Use the "Nostr: List PRs" command to list pull requests for the current repository.

4. **Initialize Repository**: Use the "Nostr: Initialize Repository" command to initialize a repository for Nostr collaboration.

5. **Copy URLs**: Right-click on any repository in the explorer view to copy its clone or web URL.

## Known Issues

None yet. Please report issues on GitHub.

## Release Notes

### 0.1.0

Initial release of ngit-vscode with full VS Code API 1.88+ compatibility

### Features

- Nostr repository discovery and announcement
- Git integration with ngit CLI tool
- Custom explorer view for Nostr repositories
- Support for NIP-46 remote signing
- Multi-workspace folder support
- Progress notifications
- Context menu commands

See [CHANGELOG.md](CHANGELOG.md) for detailed changes.

## Contributing

Contributions are welcome! Please see the [main repository](https://github.com/budabit/nostr-git) for contribution guidelines.

## License

MIT

## 🎯 Purpose

This extension integrates the Nostr protocol with VSCode's Git workflow, allowing developers to publish repository announcements, manage patches, and collaborate on code through decentralized Nostr events without leaving their development environment.

## ✨ Features

### Repository Management

- **Repository Announcements**: Publish NIP-34 repository events (kind 30617) directly from VSCode
- **Repository Discovery**: Browse and clone Nostr-announced repositories
- **Metadata Sync**: Keep repository metadata synchronized with Nostr events

### Patch Collaboration

- **Patch Publishing**: Convert local commits to NIP-34 patch events (kind 1617)
- **Patch Review**: View and apply patches from Nostr events
- **Pull Request Alternative**: Decentralized patch submission workflow
- **Merge Conflict Resolution**: Handle conflicts in Nostr-based patches

### Issue Tracking

- **Issue Creation**: Publish issues as NIP-34 events (kind 1621)
- **Issue Management**: Track and update issue status through Nostr
- **Decentralized Discussions**: Comment and collaborate on issues

### Developer Experience

- **Command Palette Integration**: Access all features through VSCode commands
- **Status Bar Indicators**: Show Nostr connection and repository status
- **Tree View**: Dedicated sidebar for Nostr repositories and events
- **Diff Viewer**: Inline patch visualization and review

### Nostr Integration

- **Multi-Relay Support**: Connect to multiple Nostr relays simultaneously
- **Event Subscriptions**: Real-time updates for repository events
- **NIP-07 Compatibility**: Secure signing through browser-based signers
- **Offline Support**: Queue events when relays are unavailable

## 📦 Installation

### VSCode Marketplace

1. Open VSCode
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Nostr-Git"
4. Click "Install"

### Manual Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nostr-git.git
cd nostr-git/packages/vscode-ngit

# Install dependencies
pnpm install

# Build the extension
pnpm build

# Package the extension
pnpm package

# Install the .vsix file
code --install-extension nostr-git-*.vsix
```

## 🚀 Quick Start

### Initial Setup

1. **Install the Extension**: Install from VSCode Marketplace
2. **Configure Relays**: Open settings and add your preferred Nostr relays
3. **Set Up Signing**: Configure NIP-07 signer or provide private key (securely)
4. **Open Repository**: Open any Git repository in VSCode

### Publishing Repository

1. Open Command Palette (Ctrl+Shift+P)
2. Run `Nostr-Git: Announce Repository`
3. Review repository metadata
4. Publish to configured relays

### Creating Patches

1. Make commits to your local repository
2. Run `Nostr-Git: Create Patch`
3. Select commits to include in patch
4. Add description and publish to Nostr

### Browsing Nostr Repositories

1. Open Nostr-Git sidebar
2. Browse announced repositories
3. Clone interesting repositories
4. Subscribe to repository updates

## 🔧 Configuration

### Extension Settings

Access through VSCode Settings (Ctrl+,) and search for "nostr-git":

```json
{
  "nostr-git.relays": ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"],
  "nostr-git.autoPublish": false,
  "nostr-git.defaultBranch": "main",
  "nostr-git.showStatusBar": true,
  "nostr-git.enableNotifications": true
}
```

### Signing Configuration

#### Using NIP-07 Signer

```json
{
  "nostr-git.signingMethod": "nip07",
  "nostr-git.signerExtension": "aka-profiles"
}
```

#### Using Private Key (Not Recommended)

```json
{
  "nostr-git.signingMethod": "privateKey",
  "nostr-git.privateKeyPath": "/path/to/secure/key/file"
}
```

## 📋 Available Commands

### Repository Commands

- `Nostr-Git: Announce Repository` - Publish repository to Nostr
- `Nostr-Git: Update Repository State` - Sync repository metadata
- `Nostr-Git: Browse Repositories` - Discover Nostr repositories

### Patch Commands

- `Nostr-Git: Create Patch` - Create patch from commits
- `Nostr-Git: Apply Patch` - Apply Nostr patch to repository
- `Nostr-Git: Review Patches` - Review pending patches

### Issue Commands

- `Nostr-Git: Create Issue` - Publish issue to Nostr
- `Nostr-Git: View Issues` - Browse repository issues
- `Nostr-Git: Update Issue` - Update issue status

### Relay Commands

- `Nostr-Git: Connect to Relays` - Establish relay connections
- `Nostr-Git: Relay Status` - Check relay connection status
- `Nostr-Git: Configure Relays` - Manage relay settings

## 🏗️ Architecture

The extension follows VSCode's extension architecture:

```
src/
├── extension.ts          # Main extension entry point
├── commands/            # Command implementations
├── providers/           # Tree data providers and views
├── services/            # Nostr and Git service integrations
├── ui/                  # Webview and UI components
└── utils/               # Utility functions and helpers
```

### Key Components

- **Extension Host**: Main extension process managing commands and services
- **Tree Providers**: Sidebar views for repositories, patches, and issues
- **Webview Panels**: Rich UI for patch review and repository details
- **Background Services**: Nostr relay connections and event processing

## 🔒 Security

### Private Key Management

- Extension never stores private keys in plain text
- Supports secure key file references
- Recommends NIP-07 signers for maximum security
- All signing operations are user-initiated

### Network Security

- WSS connections to Nostr relays
- Certificate validation for relay connections
- No sensitive data logged or transmitted

## 🧪 Development

### Local Development

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm watch

# Run extension in new VSCode window
F5 (or Run > Start Debugging)
```

### Testing

```bash
# Run unit tests
pnpm test

# Run integration tests
pnpm test:integration

# Run extension tests
pnpm test:extension
```

### Packaging

```bash
# Build for production
pnpm build

# Package extension
pnpm package

# Publish to marketplace
pnpm publish
```

## 🤝 Contributing

See the main project's [DEVELOPMENT.md](../../DEVELOPMENT.md) for development setup and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for code style guidelines.

### Extension-Specific Guidelines

1. **VSCode API**: Follow VSCode extension best practices
2. **Async Operations**: Use proper async/await patterns
3. **Error Handling**: Provide user-friendly error messages
4. **Performance**: Minimize extension activation time
5. **Accessibility**: Support VSCode's accessibility features

## 📚 Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [NIP-34 Specification](https://github.com/nostr-protocol/nips/blob/master/34.md)
- [Nostr Protocol](https://nostr.com/)
- [Git Workshop](https://gitworkshop.dev/)

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.
