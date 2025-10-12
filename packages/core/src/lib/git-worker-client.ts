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
  // Always append a cache-busting query param to avoid stale workers
  const u = new URL('./workers/git-worker.js', import.meta.url);
  try {
    u.searchParams.set('v', String(Date.now()));
  } catch {}
  console.log('[GitWorker] Spawning worker at', u.toString());
  const worker = new Worker(u, { type: 'module' });

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

// NOTE: registerEventSigner has been eliminated!
// The new EventIO interface uses closures instead of passing signers around.
// This eliminates the anti-pattern of complex message passing between worker and main thread.
