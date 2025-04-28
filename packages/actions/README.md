# GitHub Actions: Nostr Git Publisher

Publish Git events (commits, issues, releases) to Nostr automatically.

## Usage

Example workflow:

```yaml
name: Publish to Nostr
on: [push, issues]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: @git-nostr/actions@v1
        with:
          nostr_private_key: ${{ secrets.NOSTR_PRIVATE_KEY }}
```

## Inputs

| Name               | Description                 | Required |
|--------------------|------------------------------|----------|
| `nostr_private_key` | Private key to sign events   | Yes      |

## License

MIT License
