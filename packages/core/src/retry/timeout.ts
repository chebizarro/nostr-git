/**
 * Timeout Utilities
 *
 * Provides utilities to add timeouts to async operations and combine AbortSignals.
 */

import { createTimeoutError, createOperationAbortedError, type GitErrorContext } from '../errors/index.js';

/**
 * Configuration for timeout behavior.
 */
export interface TimeoutOptions {
  /** Timeout duration in milliseconds */
  timeoutMs: number;
  /** Optional AbortSignal to combine with timeout */
  signal?: AbortSignal;
  /** Context for error reporting */
  context?: GitErrorContext;
}

/**
 * Default timeout values for different operation types.
 */
export const DEFAULT_TIMEOUTS = {
  /** Default timeout for network operations (60 seconds) */
  NETWORK: 60_000,
  /** Default timeout for clone operations (5 minutes) */
  CLONE: 300_000,
  /** Default timeout for fetch operations (2 minutes) */
  FETCH: 120_000,
  /** Default timeout for push operations (2 minutes) */
  PUSH: 120_000,
  /** Default timeout for commit operations (30 seconds) */
  COMMIT: 30_000,
  /** Default timeout for GRASP operations (+50% of network) */
  GRASP: 90_000,
};

/**
 * Combine multiple AbortSignals into a single signal.
 * The combined signal aborts when any of the input signals abort.
 *
 * @param signals - Array of AbortSignals to combine
 * @returns Combined AbortSignal
 */
export function combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();
  const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

  // If any signal is already aborted, abort immediately
  if (validSignals.some(s => s.aborted)) {
    controller.abort();
    return controller.signal;
  }

  // Listen to all signals and abort when any aborts
  const abortHandler = () => controller.abort();
  validSignals.forEach(signal => {
    signal.addEventListener('abort', abortHandler, { once: true });
  });

  return controller.signal;
}

/**
 * Create an AbortSignal that aborts after a timeout.
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns AbortSignal that aborts after timeout
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

/**
 * Wrap an operation with a timeout.
 * The operation receives an AbortSignal that will abort when the timeout expires
 * or when an external signal aborts.
 *
 * @param operation - Async function that accepts an AbortSignal
 * @param options - Timeout configuration
 * @returns Result of the operation
 * @throws TimeoutError if timeout expires
 * @throws OperationAbortedError if signal is aborted
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   async (signal) => {
 *     return await fetch(url, { signal });
 *   },
 *   { timeoutMs: 30000 }
 * );
 * ```
 */
export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, signal: externalSignal, context } = options;

  // Create timeout signal
  const timeoutSignal = createTimeoutSignal(timeoutMs);

  // Combine with external signal if provided
  const combinedSignal = externalSignal
    ? combineSignals(timeoutSignal, externalSignal)
    : timeoutSignal;

  try {
    // Execute operation with combined signal
    const result = await operation(combinedSignal);
    return result;
  } catch (error) {
    // Check if error is due to abort
    if (combinedSignal.aborted) {
      // Determine if it was a timeout or external abort
      if (timeoutSignal.aborted && !externalSignal?.aborted) {
        throw createTimeoutError(context, error instanceof Error ? error : undefined);
      } else {
        throw createOperationAbortedError(context, error instanceof Error ? error : undefined);
      }
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Convenience function to wrap an operation with a network timeout.
 */
export async function withNetworkTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: Partial<TimeoutOptions>
): Promise<T> {
  return withTimeout(operation, {
    timeoutMs: DEFAULT_TIMEOUTS.NETWORK,
    ...options,
  });
}

/**
 * Convenience function to wrap an operation with a clone timeout.
 */
export async function withCloneTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: Partial<TimeoutOptions>
): Promise<T> {
  return withTimeout(operation, {
    timeoutMs: DEFAULT_TIMEOUTS.CLONE,
    ...options,
  });
}

/**
 * Convenience function to wrap an operation with a GRASP timeout (+50% budget).
 */
export async function withGraspTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: Partial<TimeoutOptions>
): Promise<T> {
  return withTimeout(operation, {
    timeoutMs: DEFAULT_TIMEOUTS.GRASP,
    ...options,
  });
}

/**
 * Check if an operation should be aborted based on a signal.
 * Throws OperationAbortedError if signal is aborted.
 *
 * @param signal - AbortSignal to check
 * @param context - Context for error reporting
 * @throws OperationAbortedError if signal is aborted
 */
export function checkAborted(signal: AbortSignal | undefined, context?: GitErrorContext): void {
  if (signal?.aborted) {
    throw createOperationAbortedError(context);
  }
}
