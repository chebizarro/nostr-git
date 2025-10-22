import { wrap } from 'comlink';
import type { EventIO } from '@nostr-git/shared-types';
// @ts-ignore - Vite handles this worker import at build time
import WorkerUrl from './worker.js?worker&url';

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
 * @param onProgress Optional callback for clone progress events
 * @returns Object with worker instance and Comlink API
 */
export function getGitWorker(onProgress?: (event: MessageEvent | CloneProgressEvent) => void) {
  // Use Vite's worker import - works in both dev and production
  console.log('[GitWorker] Creating worker at', WorkerUrl);
  const worker = new Worker(WorkerUrl, { type: 'module' });

  if (onProgress) {
    worker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }
      if (data.type === 'clone-progress' || data.type === 'merge-progress') {
        onProgress(event);
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

