import { getGitWorker } from '@nostr-git/git-worker';

export interface ForkOptions {
  sourceUrl: string;
  targetHost: 'github' | 'gitlab' | 'gitea';
  targetToken: string;
  targetUsername: string;
  targetRepo: string;
  nostrPrivateKey: Uint8Array;
  relays: string[];
}

export async function forkViaWorker(opts: ForkOptions): Promise<string> {
  const { api } = await getGitWorker();
  const url = await api.cloneAndFork(opts);
  return url;
}
