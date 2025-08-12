import { NostrGitProvider } from '../src/nostr-git-provider.js';
import type { NostrEvent } from '../src/nostr-client.js';
import { makeRepoAddr } from '../src/repo-addr.js';
import { MemoryProtocolPrefs } from '../src/prefs-store.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.js';

// Demo Nostr client that logs publications
class DemoNostr {
  async publish(evt: NostrEvent): Promise<string> {
    console.log('[nostr.publish]', evt.kind, 'tags=', evt.tags.length, 'content.len=', evt.content?.length || 0);
    return evt.id ?? Math.random().toString(16).slice(2);
  }
  subscribe(): string { return 'sub'; }
  unsubscribe(): void {}
  async sign(evt: any): Promise<NostrEvent> { return { ...(evt as any), id: Math.random().toString(16).slice(2) } as NostrEvent; }
}

// Minimal Git provider; we don't need server push for PR path
class DemoGit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async push(_opts: any): Promise<any> { return { ok: true }; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async merge(_opts: any): Promise<any> { return { oid: 'deadbeef', clean: true }; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async clone(_opts: any): Promise<any> { return {}; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async fetch(_opts: any): Promise<any> { return {}; }
}

async function setupRepo(dir: string) {
  // Initialize a real git repo with isomorphic-git
  await git.init({ fs, dir, defaultBranch: 'main' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo Repo\n');
  await git.add({ fs, dir, filepath: 'README.md' });
  await git.commit({ fs, dir, message: 'chore: init', author: { name: 'Demo', email: 'demo@example.com' } });

  // Create a feature branch and change a file
  await git.branch({ fs, dir, ref: 'feature-x' });
  await git.checkout({ fs, dir, ref: 'feature-x' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# Demo Repo\n\nAdded feature X\n');
  await git.add({ fs, dir, filepath: 'README.md' });
  await git.commit({ fs, dir, message: 'feat: feature x', author: { name: 'Demo', email: 'demo@example.com' } });
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ngit-demo-'));
  console.log('Working dir:', tmp);
  await setupRepo(tmp);

  const gitProvider = new DemoGit();
  const nostr = new DemoNostr();
  const provider = new NostrGitProvider(gitProvider as any, nostr as any);
  provider.configureProtocolPrefsStore(new MemoryProtocolPrefs());

  const repoId = 'demo-repo';
  const owner = 'f'.repeat(64);
  const repoAddr = makeRepoAddr(owner, repoId);

  // For demonstration, discovery is not required for PR publication
  // Provide fs/dir + baseBranch so default patch content includes a unified diff
  await provider.push({
    dir: tmp,
    fs: fs as unknown as any,
    refspecs: ['refs/heads/pr/feature-x'],
    repoId,
    repoAddr,
    baseBranch: 'refs/heads/main',
    timeoutMs: 1000,
  });

  console.log('Clone-and-PR example finished');
}

main().catch(err => { console.error(err); process.exit(1); });
