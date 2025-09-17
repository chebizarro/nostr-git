# Terminal.svelte (browser-only, repo-scoped)

A themable xterm.js terminal that runs commands in a Web Worker and talks to a repo-scoped FS and Git via adapters. Designed for mobile (Capacitor) and integrates with the Flotilla feed.

## Usage

```svelte
<script lang="ts">
  import Terminal from "@nostr-git/ui/src/lib/components/terminal/Terminal.svelte";
  let termRef: any;
  const repoRef = { relay, naddr, npub, repoId };
</script>

<Terminal bind:this={termRef} repoRef={repoRef} fs={fs} relays={relays} height={360} />
```

### Feed integration

```ts
import { createTerminalFeedBridge } from "@nostr-git/ui/src/lib/components/terminal/feed-bridge";
const bridge = createTerminalFeedBridge(termRef, feedStore, currentUser);
// call bridge.destroy() on unmount
```

## Worker protocol

UI → Worker: `run`, `abort`, `fs` proxy. Worker → UI: `stdout`, `stderr`, `exit`, `progress`, `toast`, `cwd`.

## Limits & safety

- Output: 1MB/10k lines, 30s runtime (configurable)
- curl/wget: HTTPS only, 20MB/15s caps, CORS required
- No pipes or chaining; simple argv tokenization with quotes

## TODO

- Implement git-cli-adapter mappings to `@nostr-git/core` worker API
- Add remaining shell builtins, curl/wget with allowlist
- Wire `onProgress` to UI toasts
- History persistence (IndexedDB)
- Toolbar actions (Connect, Pull, Push, Upload, Clear, Settings)
- Feed “Run” button rendering for other users’ /git or /sh messages
