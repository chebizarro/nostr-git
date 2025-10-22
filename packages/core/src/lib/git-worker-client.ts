import { wrap } from 'comlink';
import type { EventIO } from './eventio.js';

export interface CloneProgressEvent {
  type: 'clone-progress';
  repoId: string;
  phase: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

/**
 * Get a Git worker instance with Comlink API wrapper.
 * 
 * IMPORTANT: After creating the worker, you must call api.setEventIO(io)
 * to configure the EventIO instance before performing any GRASP operations.
 * 
 * @param onProgress Optional callback for clone progress events
 * @returns Object with worker instance and Comlink API
 */
export function getGitWorker(onProgress?: (event: CloneProgressEvent) => void) {
  const meta = import.meta as any;
  const workerSpecifier = meta?.env?.DEV
    ? /* @vite-ignore */ new URL('./workers/git-worker.ts', import.meta.url)
    : '/_app/lib/workers/git-worker.js';

  console.log('[GitWorker] Creating worker at', workerSpecifier.toString());
  const worker = new Worker(workerSpecifier, { type: 'module' });

  if (onProgress) {
    worker.addEventListener('message', (event: MessageEvent) => {
      if (event.data.type === 'clone-progress') {
        onProgress(event.data);
      }
    });
  }

  const api = wrap<any>(worker);
  return { api, worker };
}

/**
 * Configure EventIO for a git worker.
 * This must be called before performing any GRASP operations.
 * 
 * @param api The Comlink-wrapped worker API
 * @param io The EventIO instance to use for Nostr operations
 */
export async function configureWorkerEventIO(api: any, io: EventIO): Promise<void> {
  console.log('[GitWorker] Configuring EventIO');
  await api.setEventIO(io);
  console.log('[GitWorker] EventIO configured successfully');
}

