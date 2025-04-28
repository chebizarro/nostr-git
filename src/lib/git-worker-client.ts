import { wrap } from 'magic-portal';

export async function getGitWorker() {
  const worker = new Worker(new URL('./workers/git-worker.ts', import.meta.url), { type: 'module' });
  const portal = new wrap(worker);
  const api = await portal.get('cloneAndFork');
  return { api, worker };
}
