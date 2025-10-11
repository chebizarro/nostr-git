/**
 * Retry Logic with Exponential Backoff
 *
 * Provides utilities to retry operations with exponential backoff and jitter.
 * Respects error categories to avoid retrying user-actionable errors.
 */

import { isUserActionableError, isRetriableError, type GitError } from '../errors/types.js';

/**
 * Configuration for retry behavior.
 */
export interface RetryOptions {
  /** Maximum number of attempts (including initial attempt) */
  maxAttempts: number;
  /** Initial delay in milliseconds before first retry */
  initialDelayMs: number;
  /** Maximum delay in milliseconds between retries */
  maxDelayMs: number;
  /** Whether to add random jitter to delays */
  jitter: boolean;
  /** Custom function to determine if an error should be retried */
  shouldRetry?: (error: GitError) => boolean;
  /** Callback invoked before each retry attempt */
  onRetry?: (attempt: number, error: GitError, delayMs: number) => void;
}

/**
 * Default retry options.
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 2000,
  jitter: true,
};

/**
 * Default retry strategy:
 * - Retry RETRIABLE errors
 * - Do NOT retry USER_ACTIONABLE errors
 * - Retry FATAL errors once (in case of transient FS issues)
 */
function defaultShouldRetry(error: GitError, attempt: number): boolean {
  // Never retry user-actionable errors
  if (isUserActionableError(error)) {
    return false;
  }

  // Always retry retriable errors (up to max attempts)
  if (isRetriableError(error)) {
    return true;
  }

  // Retry fatal errors only once (attempt 1 = first retry)
  // This handles transient FS issues
  return attempt === 1;
}

/**
 * Calculate delay for a retry attempt with exponential backoff.
 *
 * @param attempt - Retry attempt number (0-based, 0 = first retry)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = options.initialDelayMs * Math.pow(2, attempt);
  
  // Cap at max delay
  let delay = Math.min(exponentialDelay, options.maxDelayMs);

  // Add jitter if enabled (±25% random variation)
  if (options.jitter) {
    const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an operation with exponential backoff.
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration (merged with defaults)
 * @returns Result of the operation
 * @throws Last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => {
 *     return await fetchFromNetwork();
 *   },
 *   {
 *     maxAttempts: 5,
 *     initialDelayMs: 1000,
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const shouldRetry = opts.shouldRetry || defaultShouldRetry;

  let lastError: GitError | undefined;
  
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      // Attempt the operation
      return await operation();
    } catch (error) {
      // Convert to GitError if needed
      const gitError = error as GitError;
      lastError = gitError;

      // Check if we should retry
      const isLastAttempt = attempt === opts.maxAttempts - 1;
      if (isLastAttempt || !shouldRetry(gitError, attempt)) {
        // No more retries or error is not retriable
        throw gitError;
      }

      // Calculate delay for next retry
      const delayMs = calculateDelay(attempt, opts);

      // Invoke retry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, gitError, delayMs);
      }

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Retry failed with no error');
}

/**
 * Retry options with higher budgets for GRASP operations.
 * GRASP operations may have higher latency due to relay variance.
 */
export const GRASP_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 750, // +50% of default
  maxDelayMs: 3000, // +50% of default
  jitter: true,
};

/**
 * Convenience function to retry with GRASP-specific options.
 */
export async function withGraspRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(operation, { ...GRASP_RETRY_OPTIONS, ...options });
}
