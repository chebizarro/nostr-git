# Change Log

All notable changes to the "ngit-vscode" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Multi-workspace folder support for all commands
- Progress notifications for long-running operations
- Enhanced error handling with user-friendly messages
- Context menu commands for copying clone and web URLs
- Repository management features (add, remove, refresh, clear)

### Changed

- Upgraded to VS Code API v1.88+
- Improved TreeItem implementation with context values
- Refactored command implementations to use async/await
- Updated NIP-46 client with better connection management
- Enhanced repository announcement parsing
- Improved UI/UX with better tooltips and descriptions

### Fixed

- Type mismatches in repository announcement interface
- Import issues with shared types
- Command registration and activation events
- Tree view rendering and refresh mechanisms

### Removed

- Deprecated API usage
- Manual activation events (now using VS Code's automatic activation)

## [0.1.0] - 2025-08-07

### Added

- Initial release of ngit-vscode extension
- Nostr repository discovery and announcement
- Git integration with ngit CLI tool
- Custom explorer view for Nostr repositories
- Support for NIP-46 remote signing
- Basic commands for listing PRs and initializing repositories
