import { wrap } from 'comlink';

export function getGitWorker() {
  const worker = new Worker(new URL('./workers/git-worker.ts', import.meta.url), { type: 'module' });
  const api = wrap<any>(worker);
  return { api, worker };
}
