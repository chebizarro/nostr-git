# Nostr-Git Integration Platform

A comprehensive TypeScript monorepo for integrating Git workflows with the Nostr protocol, enabling decentralized Git collaboration through NIP-34 events.

See also: [Git Stacking and Merge Metadata](docs/nostr-git-stacking.md)

## 🎯 Purpose

This platform bridges Git version control with Nostr's decentralized network, allowing developers to:

- Publish Git repositories, patches, and issues as Nostr events
- Enable decentralized code collaboration without centralized platforms
- Integrate Git workflows with Nostr clients and relays
- Build Git-aware applications on the Nostr protocol

## 📦 Packages

### Core Libraries

- **[@nostr-git/core](packages/core/)** – Core TypeScript library for creating, parsing, and publishing Git-related Nostr events (NIP-34)
- **[@nostr-git/shared-types](packages/shared-types/)** – Shared TypeScript types and constants for Git/Nostr event structures
- **[@nostr-git/git-wrapper](packages/git-wrapper/)** – Git operations wrapper with Nostr integration
- **[@nostr-git/ui](packages/ui/)** – Svelte 5 component library with TailwindCSS for rendering Git and Nostr UI elements

### Applications & Extensions

- **[Extension](packages/extension/)** – Browser extension that adds Nostr publishing capabilities to GitHub
- **[VSCode-ngit](packages/vscode-ngit/)** – VS Code extension adding Nostr Git (`ngit`) support to the IDE
- **[Actions](packages/actions/)** – GitHub Actions for automatically publishing Nostr Git events on push, issue creation, etc.
## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/nostr-git.git
cd nostr-git

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Development

```bash
# Start development mode for all packages
pnpm watch:all

# Or watch specific packages
pnpm watch:core
pnpm watch:ui
```

## 🏗️ Architecture

This monorepo follows a modular architecture where each package serves a specific purpose:

- **Core**: Event creation, parsing, and Nostr protocol integration
- **UI**: Reusable Svelte components for Git/Nostr interfaces
- **Extensions**: Platform-specific integrations (GitHub, VSCode)
- **Actions**: CI/CD automation for Nostr event publishing

## 📖 Documentation

- [Architecture Guide](ARCHITECTURE.md) - System design and component relationships
- [Development Guide](DEVELOPMENT.md) - Local setup and development workflow
- [AI Context](AI_CONTEXT.md) - LLM-specific coding context and patterns
- [Coding Standards](CODING_STANDARDS.md) - Code style and conventions
- [Deployment Guide](DEPLOYMENT.md) - Build and deployment processes
- [Subscription Cookbook](docs/subscription-cookbook.md) - Practical NIP-34/22/32 subscription patterns

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following our [coding standards](CODING_STANDARDS.md)
4. Run tests: `pnpm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [NIP-34 Specification](https://github.com/nostr-protocol/nips/blob/master/34.md)
- [Nostr Protocol](https://nostr.com/)
- [Project Documentation](docs/)
