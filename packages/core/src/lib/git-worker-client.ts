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
  
  // Set up a custom message handler for event signing requests
  worker.addEventListener('message', (event) => {
    if (event.data.type === 'request-event-signing') {
      // This will be handled by the UI thread
      console.log('Received event signing request from worker:', event.data);
      
      // The UI thread will post a message back to the worker with the signed event
      // This is handled by the registerEventSigner function below
    }
  });
  
  const api = wrap<any>(worker);
  return { api, worker };
}

// This function is called by the UI thread to register an event signer
// It sets up a message handler for event signing requests
export function registerEventSigner(worker: Worker, signer: (event: any) => Promise<any>) {
  // Set up a message handler for event signing requests
  worker.addEventListener('message', async (event) => {
    if (event.data.type === 'request-event-signing') {
      try {
        console.log('Signing event from worker:', event.data.event);
        const signedEvent = await signer(event.data.event);
        console.log('Event signed successfully');
        
        // Send the signed event back to the worker
        worker.postMessage({
          type: 'event-signed',
          requestId: event.data.requestId,
          signedEvent
        });
      } catch (error) {
        console.error('Error signing event:', error);
        
        // Send the error back to the worker
        worker.postMessage({
          type: 'event-signing-error',
          requestId: event.data.requestId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  });
  
  // Tell the worker that event signing is available
  return worker.postMessage({ type: 'register-event-signer' });
}
