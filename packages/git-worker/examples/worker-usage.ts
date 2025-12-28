// Example: Using git-worker.ts with Comlink in the main thread
import { wrap } from 'comlink';

// Example: Using git-worker.ts with Comlink in the main thread
const worker = new Worker(new URL('../src/lib/workers/git-worker.ts', import.meta.url), {
  type: 'module'
});
const api = wrap<any>(worker);

(async () => {
  // Example 1: cloneAndFork
  const remoteUrl = await api.cloneAndFork({
    sourceUrl: 'https://github.com/example/repo.git',
    targetHost: 'github',
    targetToken: 'ghp_xxx',
    targetUsername: 'your-username',
    targetRepo: 'forked-repo',
    nostrPrivateKey: new Uint8Array([]), // Fill in your key
    relays: ['wss://relay.nostr.example']
  });
  console.log('Forked repo is at:', remoteUrl);

  // Example 2: listRepoFiles
  const files = await api.listRepoFiles({
    host: 'github.com',
    owner: 'example',
    repo: 'repo',
    branch: 'main',
    path: ''
  });
  console.log('Repo files:', files);

  // Example 3: fetchPermalink
  const content = await api.fetchPermalink({
    host: 'github.com',
    owner: 'example',
    repo: 'repo',
    branch: 'main',
    filePath: 'README.md',
    startLine: 0,
    endLine: 10
  });
  console.log('Permalink content:', content);

  worker.terminate();
})();
