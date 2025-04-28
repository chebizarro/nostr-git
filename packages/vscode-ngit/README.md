# ngit VS Code Extension

Interact with [Nostr](https://github.com/nostr-protocol/nostr)-backed Git repositories directly from Visual Studio Code using [`ngit`](https://gitworkshop.dev/ngit).

## Features

- List open Nostr pull requests via `ngit list`
- Announce repositories to Nostr with `ngit init`
- Built-in NIP-34 event semantics (30617, 1622, 1623) through `ngit` CLI

## Requirements

- Git must be installed and available in your system PATH
- `ngit` and `git-remote-nostr` binaries must be installed and available in PATH  
  ([Installation guide](https://gitworkshop.dev/ngit))

## Usage

1. Open a Git-enabled workspace
2. Open the command palette (⇧⌘P / Ctrl+Shift+P)
3. Run `List Nostr PRs` or `Announce Repo to Nostr`

## Coming Soon

- Tree view for Nostr-based PRs
- Inline diff viewing from kind:1622 events
- Remote patch submissions via Nostr
- NIP-46 signer support

## Resources

- [gitworkshop.dev/repos](https://gitworkshop.dev/repos)
- [NIP-34](https://github.com/nostr-protocol/nips/blob/master/34.md)
- [NIP-95](https://github.com/nostr-protocol/nips/blob/master/95.md)
