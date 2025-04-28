# Generate Repo Announcement for Nostr (kind: 30617)

This GitHub Action generates a `.repo-announcement.json` based on your repository’s metadata. It is intended for use with Nostr integrations like [kind: 30617 repo announcements](https://github.com/nostr-protocol/nips/blob/master/34.md).

## Usage

```yaml
- name: Generate announcement JSON
  uses: your-org/generate-repo-announcement@v1
  with:
    output-path: .repo-announcement.json
```

Then you can publish it using another action:

```yaml
- name: Publish to Nostr
  uses: nostr-actions/nostr-post-event@v1
  with:
    nostr-private-key: ${{ secrets.NOSTR_PRIVATE_KEY }}
    nostr-relay-url: wss://relay.damus.io
    github-event-name: "repository"
    github-event-path: ".repo-announcement.json"
```

## Inputs

| Name         | Description                                | Default                    |
|--------------|--------------------------------------------|----------------------------|
| `output-path`| Output file path for JSON                  | `.repo-announcement.json` |

## Outputs

| Name        | Description                         |
|-------------|-------------------------------------|
| `json-path` | Path to the generated JSON file     |

## Requirements

- `GITHUB_TOKEN` (automatically available in Actions)
