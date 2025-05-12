import { getGitWorker } from './git-worker-client.js';

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
  const { api } = getGitWorker();
  const url = await api.cloneAndFork(opts);
  return url;
}
