import { wrap } from 'comlink';

/**
 * Git worker instance for UI package
 * This provides access to the git-worker from @nostr-git/core
 */
let gitWorkerInstance: any = null;

/**
 * Get or create the git worker instance
 * Uses Comlink to communicate with the web worker
 */
export async function getGitWorker() {
  if (!gitWorkerInstance) {
    // Create a new worker instance
    const worker = new Worker(
      new URL('@nostr-git/core/src/lib/workers/git-worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    gitWorkerInstance = wrap(worker);
  }
  
  return gitWorkerInstance;
}

/**
 * Terminate the git worker instance
 * Call this when the application is shutting down
 */
export function terminateGitWorker() {
  if (gitWorkerInstance) {
    gitWorkerInstance[Symbol.for('comlink.terminate')]?.();
    gitWorkerInstance = null;
  }
}
