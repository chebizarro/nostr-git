import {NostrGitProvider} from "../src/nostr-git-provider.js"
import type {GitProvider} from "../src/provider.js"
import type {NostrClient, NostrEvent, UnsignedEvent} from "../src/nostr-client.js"
import {makeRepoAddr} from "../src/repo-addr.js"
import {MemoryProtocolPrefs} from "../src/prefs-store.js"

// Minimal in-memory Nostr client for demo
class DemoNostr implements NostrClient {
  publishCalls: NostrEvent[] = []
  async publish(evt: NostrEvent): Promise<string> {
    this.publishCalls.push(evt)
    console.log("[nostr.publish]", evt.kind, evt.tags.map(t => t[0] + ":" + t[1]).join(","))
    return evt.id ?? Math.random().toString(16).slice(2)
  }
  subscribe(_filter: any, _onEvent: (e: NostrEvent) => void): string {
    return "sub-demo"
  }
  unsubscribe(_id: string): void {}
  async sign(evt: UnsignedEvent): Promise<NostrEvent> {
    return {...(evt as any), id: Math.random().toString(16).slice(2)}
  }
}

// Fake Git provider that fails first push (ssh) and succeeds second (https)
class DemoGit implements GitProvider {
  private pushed = false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async push(options: any): Promise<any> {
    if (!this.pushed && options.url?.startsWith("ssh://")) {
      this.pushed = true
      throw new Error("ssh failed")
    }
    console.log("[git.push] to", options.url ?? "(no-url)")
    return {ok: true}
  }
  // The rest of interface methods are unused in this example
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async merge(_opts: any): Promise<any> {
    return {oid: "deadbeef", clean: true}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async clone(_opts: any): Promise<any> {
    return {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetch(_opts: any): Promise<any> {
    return {}
  }
}

async function main() {
  const git = new DemoGit()
  const nostr = new DemoNostr()
  const provider = new NostrGitProvider(git as any, nostr as any)
  provider.configureProtocolPrefsStore(new MemoryProtocolPrefs())

  const repoId = "demo-repo"
  const owner = "f".repeat(64)
  const repoAddr = makeRepoAddr(owner, repoId)

  // Stub discovery to provide two URLs so push can fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(provider as any).discoverRepo = async () => ({
    urls: ["ssh://git@host/demo-repo", "https://host/demo-repo"],
  })

  const result = await provider.push({
    refspecs: ["refs/heads/main"],
    repoId,
    url: "ssh://git@host/demo-repo",
    nostrStatus: {repoAddr, rootId: "root-evt", content: "Push applied to main", close: true},
    timeoutMs: 1000,
  })

  console.log("Push result:", result.server)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
