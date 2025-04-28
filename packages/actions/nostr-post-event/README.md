# Nostr Post Event GitHub Action

This GitHub Action posts GitHub metadata (issues, PRs, etc.) to a Nostr relay.

## Usage

```yaml
- uses: nostr-actions/nostr-post-event@v1
  with:
    nostr-private-key: ${{ secrets.NOSTR_PRIVATE_KEY }}
    nostr-relay-url: wss://relay.damus.io
