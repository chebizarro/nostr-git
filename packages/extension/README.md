# Nostr-Git Browser Extension

[![Made for Nostr](https://img.shields.io/badge/Nostr-enabled-purple?logo=nostr&logoColor=white)](https://github.com/nostr-protocol)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/extension-id)](https://chrome.google.com/webstore/detail/extension-id)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../../LICENSE)

Browser extension that seamlessly integrates GitHub workflows with the Nostr protocol, enabling decentralized code collaboration through NIP-34 events.

## 🎯 Purpose

This extension bridges the gap between centralized Git platforms and the decentralized Nostr network, allowing developers to publish repository announcements, patches, and issues as Nostr events directly from GitHub's interface.

## ✨ Features

### Repository Integration
- **Repository Announcements**: Create NIP-34 repository announcement events (kind 30617) from any GitHub repository
- **Repository State**: Publish repository metadata and state information (kind 30618)
- **One-Click Publishing**: Seamlessly publish to multiple Nostr relays with a single click

### Code Collaboration
- **Patch Events**: Convert GitHub pull requests to NIP-34 patch events (kind 1617)
- **Issue Events**: Transform GitHub issues into Nostr issue events (kind 1621)
- **Code Snippets**: Share code selections as NIP-95 snippet events with syntax highlighting
- **Permalinks**: Generate Nostr-compatible permalinks for GitHub content

### Rich Metadata Extraction
Automatically captures and includes:
- Repository metadata (name, description, topics, license)
- Commit information and messages
- File paths and language detection
- Line ranges and code context
- Branch and tag information
- Contributor and maintainer data

### Security & Privacy
- **NIP-07 Integration**: Secure event signing through browser-based Nostr signers
- **Configurable Relays**: User-controlled relay selection and management
- **Private Key Safety**: No private key storage or handling by the extension
- **Permission Management**: Minimal required permissions for GitHub integration

### User Experience
- **Contextual UI**: Buttons and controls appear contextually on GitHub pages
- **Real-time Feedback**: Publishing status and relay connection indicators
- **Customizable Settings**: Relay configuration and publishing preferences
- **Offline Support**: Queue events when relays are unavailable

## 📦 Installation

### Chrome Web Store
1. Visit the [Chrome Web Store page](https://chrome.google.com/webstore/detail/extension-id)
2. Click "Add to Chrome"
3. Confirm installation and grant permissions

### Manual Installation (Development)
```bash
# Clone the repository
git clone https://github.com/your-org/nostr-git.git
cd nostr-git/packages/extension

# Install dependencies
pnpm install

# Build the extension
pnpm build:prod

# Load unpacked extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the dist/ directory
```

## 🚀 Quick Start

### Initial Setup
1. **Install a Nostr Signer**: Install a NIP-07 compatible browser extension like [AKA Profiles](https://akaprofiles.com/) or [nos2x](https://github.com/fiatjaf/nos2x)
2. **Configure Relays**: Click the extension icon and add your preferred Nostr relays
3. **Navigate to GitHub**: Visit any GitHub repository or issue page

### Publishing Repository Announcements
1. Navigate to a GitHub repository main page
2. Look for the "Publish to Nostr" button near the repository title
3. Click the button and review the generated event
4. Confirm publishing to your configured relays

### Sharing Code Snippets
1. Select code on any GitHub file page
2. Right-click and choose "Share on Nostr" from the context menu
3. Add optional description and tags
4. Publish the snippet event

### Creating Patch Events
1. Navigate to a GitHub pull request
2. Click the "Publish Patch to Nostr" button
3. Review the generated patch event with diff content
4. Publish to share the patch with the Nostr network

## 🔧 Configuration

### Relay Management
Access relay settings through the extension popup:

```javascript
// Default relay configuration
const defaultRelays = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
];
```

### Extension Settings
- **Auto-publish**: Automatically publish certain event types
- **Default relays**: Set preferred relays for publishing
- **Event templates**: Customize event content templates
- **Privacy settings**: Control metadata inclusion

## 🏗️ Architecture

The extension follows Chrome's Manifest V3 architecture:

```
src/
├── manifest.json         # Extension manifest and permissions
├── background/           # Service worker for background tasks
├── content/             # Content scripts for GitHub integration
├── popup/               # Extension popup interface
├── options/             # Settings and configuration pages
└── shared/              # Shared utilities and types
```

### Key Components
- **Content Scripts**: Inject UI elements into GitHub pages
- **Background Service**: Handle Nostr relay connections and event publishing
- **Popup Interface**: Relay management and extension settings
- **Message Passing**: Secure communication between extension contexts

## 🔒 Security

### Permission Model
The extension requests minimal permissions:
- `activeTab`: Access to the current GitHub tab
- `storage`: Store relay configuration and settings
- `host_permissions`: GitHub.com access only

### Private Key Safety
- Extension never handles or stores private keys
- All signing operations delegated to NIP-07 signers
- Events are signed in the user's browser context
- No sensitive data transmitted to external servers

## 🧪 Development

### Local Development
```bash
# Install dependencies
pnpm install

# Start development build with hot reload
pnpm dev

# Build for production
pnpm build:prod

# Run tests
pnpm test
```

### Testing
```bash
# Unit tests
pnpm test:unit

# Integration tests with GitHub pages
pnpm test:integration

# End-to-end tests
pnpm test:e2e
```

## 🤝 Contributing

See the main project's [DEVELOPMENT.md](../../DEVELOPMENT.md) for development setup and [CODING_STANDARDS.md](../../CODING_STANDARDS.md) for code style guidelines.

### Extension-Specific Guidelines
1. **Manifest V3 Compliance**: Follow Chrome's latest extension standards
2. **Minimal Permissions**: Request only necessary permissions
3. **Content Security Policy**: Strict CSP for security
4. **Cross-Browser Compatibility**: Test on Chrome, Firefox, and Edge

## 📄 License

MIT License - see [LICENSE](../../LICENSE) for details.

---

## Installation

### Chrome Web Store (Coming Soon)
The extension will be available in the Chrome Web Store for easy installation.

### Firefox Add-ons (Coming Soon)
Firefox users will be able to install directly from Firefox Add-ons.

### Developer Mode

1. **Clone the repo**:
   ```bash
   git clone https://github.com/chebizarro/nostr-git-extension.git
   cd nostr-git-extension
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   - For Chrome:
     ```bash
     npm run build:chrome
     ```
   - For Firefox:
     ```bash
     npm run build:firefox
     ```

4. **Load the extension**:
   - Chrome:
     - Visit `chrome://extensions/`
     - Enable **Developer Mode**
     - Click **"Load unpacked"**
     - Select the `dist/nostr-github-extension` directory
   - Firefox:
     - Visit `about:debugging#/runtime/this-firefox`
     - Click **"Load Temporary Add-on"**
     - Select any file in the `dist/nostr-github-extension` directory

---

## How It Works

### Creating Code Snippets
1. Navigate to any file or line range on GitHub
2. Right-click or use the gutter menu to select **Create Nostr Snippet** or **Create Nostr Permalink**
3. Add an optional description in the GitHub-style modal
4. The extension creates and signs a Nostr event (kind `1337` or `1623`)
5. The event is published to your configured relays

### Repository Announcements
1. Visit any GitHub repository's main page
2. Click the Nostr Git icon in the repository header
3. Review and customize the announcement metadata
4. Publish to share with the Nostr community

## Configuration

### Initial Setup
1. Click the Nostr Git icon in your browser toolbar
2. Connect your NIP-07 compatible signer
3. Add your preferred relays (e.g. `wss://relay.damus.io`)

---

## Contributing

We welcome contributions from the community! Whether it's code, documentation, or feature suggestions, your help makes this project better.

### Getting Started
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

### Development Guidelines
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Keep commits focused and descriptive

Repo: [https://github.com/chebizarro/nostr-git-extension](https://github.com/chebizarro/nostr-git-extension)

---

## License

This project is licensed under the [MIT License](https://github.com/chebizarro/nostr-git-extension/blob/main/LICENSE).

---

## Support

If you find this extension useful, consider:
- Starring the repository
- Sharing it with your network
- Contributing to its development
- Following the project on Nostr
