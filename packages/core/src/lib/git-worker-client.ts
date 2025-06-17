import { wrap } from 'comlink';

export interface CloneProgressEvent {
  type: 'clone-progress';
  repoId: string;
  phase: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

export function getGitWorker(onProgress?: (event: CloneProgressEvent) => void) {
  const worker = new Worker(new URL('./workers/git-worker.js', import.meta.url), { type: 'module' });
  
  if (onProgress) {
    worker.addEventListener('message', (event) => {
      if (event.data.type === 'clone-progress') {
        onProgress(event.data);
      }
    });
  }
  
  const api = wrap<any>(worker);
  return { api, worker };
}
