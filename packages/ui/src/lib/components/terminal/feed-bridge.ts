// Bridge between Terminal.svelte and Flotilla feed page
// Provides createTerminalFeedBridge(handle, feedStore, currentUser)

export interface TerminalHandle {
  focus(): void;
  clear(): void;
  runCommand(cmd: string): Promise<number>;
  abort(): void;
}

export interface FeedMessage {
  id: string;
  kind: string;
  content: string;
  author: string;
  created_at: number;
}
export interface FeedStore {
  subscribe: (cb: (msgs: FeedMessage[]) => void) => () => void;
  post: (content: string) => Promise<void>;
}

export function createTerminalFeedBridge(
  terminal: TerminalHandle,
  feed: FeedStore,
  currentUser: { npub: string },
  opts?: { throttleMs?: number }
) {
  const throttleMs = opts?.throttleMs ?? 1000;
  let lastPostAt = 0;

  const unsub = feed.subscribe((msgs) => {
    for (const m of msgs) {
      if (!m.content) continue;
      // Only act on commands prefixed with /git or /sh
      const trimmed = m.content.trim();
      const isCmd = trimmed.startsWith("/git ") || trimmed.startsWith("/sh ");
      if (!isCmd) continue;
      // Never auto-run our own commands, just echo
      if (m.author === currentUser.npub) continue;
      // Render a small hint in terminal; execution is manual via UI button (to be integrated by host)
      // We print a clickable hint text; host can overlay a Run button.
      // For now, just print a hint.
      (terminal as any).printHint?.(`Received command from ${m.author}: ${trimmed}`);
    }
  });

  async function postOutput(feedText: string) {
    const now = Date.now();
    if (now - lastPostAt < throttleMs) return; // simple throttle
    lastPostAt = now;
    await feed.post(feedText);
  }

  return {
    destroy: () => unsub(),
    mirrorCommand: async (cmd: string, summary: string) => {
      await postOutput(`/sh ${cmd}\n${summary}`);
    },
    mirrorChunk: async (chunk: string) => {
      // chunk long outputs upstream at ~500 chars
      const parts = chunk.match(/.{1,500}/gs) || [];
      for (const p of parts) {
        await postOutput(p);
      }
    },
  };
}
