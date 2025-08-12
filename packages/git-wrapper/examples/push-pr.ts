import { NostrGitProvider } from '../src/nostr-git-provider.js';
import type { GitProvider } from '../src/provider.js';
import type { NostrClient, NostrEvent, UnsignedEvent } from '../src/nostr-client.js';
import { makeRepoAddr } from '../src/repo-addr.js';
import { MemoryProtocolPrefs } from '../src/prefs-store.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Minimal Nostr client (no network), logs published events
class DemoNostr implements NostrClient {
  async publish(evt: NostrEvent): Promise<string> {
    console.log('[nostr.publish]', evt.kind, 'tags=', evt.tags.length, 'content.length=', evt.content?.length || 0);
    return evt.id ?? Math.random().toString(16).slice(2);
  }
  subscribe(): string { return 'sub'; }
  unsubscribe(): void {}
  async sign(evt: UnsignedEvent): Promise<NostrEvent> { return { ...(evt as any), id: Math.random().toString(16).slice(2) }; }
}

// Minimal Git provider; only push is used for normal refs in this example
class DemoGit implements GitProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async push(_opts: any): Promise<any> { return { ok: true }; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async merge(_opts: any): Promise<any> { return { oid: 'deadbeef', clean: true }; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async clone(_opts: any): Promise<any> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetch(_opts: any): Promise<any> { return {}; }
}

async function main() {
  const git = new DemoGit();
  const nostr = new DemoNostr();
  const provider = new NostrGitProvider(git as any, nostr as any);
  provider.configureProtocolPrefsStore(new MemoryProtocolPrefs());

  const workDir = path.join(process.cwd(), 'tmp-demo');
  fs.mkdirSync(workDir, { recursive: true });
  // Create a couple of files to simulate a diff; this example doesn't truly commit,
  // but demonstrates providing fs/dir to enable unified diff generation when refs exist.
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Demo\n');

  const repoId = 'demo-repo';
  const owner = 'f'.repeat(64);
  const repoAddr = makeRepoAddr(owner, repoId);

  // PR ref triggers NIP-34 GIT_PATCH publication with enriched metadata and content
  await provider.push({
    dir: workDir,
    fs: fs as unknown as any,
    refspecs: ['refs/heads/pr/feature-x'],
    repoId,
    repoAddr,
    baseBranch: 'refs/heads/main',
    patchContent: undefined, // allow default generator (cover letter + unified diff if resolvable)
    timeoutMs: 1000,
  });

  console.log('PR push example finished');
}

main().catch(err => { console.error(err); process.exit(1); });
