/**
 * Structured Tracing System
 *
 * Provides lightweight, tree-shakable tracing for Git operations.
 * Traces are emitted as structured spans with timing and context information.
 */

/**
 * Trace span types for different operations.
 */
export type TraceSpan =
  | RepoSpan
  | GitSpan
  | NetworkSpan;

/**
 * Repository-level operations (create, fork, clone).
 */
export interface RepoSpan {
  type: 'repo.create' | 'repo.fork' | 'repo.clone';
  naddr: string;
  remote?: string;
  t0: number;
  t1?: number;
  err?: string;
}

/**
 * Git operations (fetch, pull, push, commit, branch, checkout).
 */
export interface GitSpan {
  type: 'git.fetch' | 'git.pull' | 'git.push' | 'git.commit' | 'git.branch' | 'git.checkout' | 'git.merge' | 'git.tag';
  naddr: string;
  ref?: string;
  remote?: string;
  t0: number;
  t1?: number;
  err?: string;
}

/**
 * Network operations (GRASP HTTP, Nostr publish/fetch).
 */
export interface NetworkSpan {
  type: 'grasp.http' | 'nostr.publish' | 'nostr.fetch';
  naddr?: string;
  target: string;
  t0: number;
  t1?: number;
  err?: string;
}

/**
 * Function that receives trace spans.
 */
export type TraceSink = (span: TraceSpan) => void;

/**
 * Global trace sink (null = tracing disabled).
 */
let traceSink: TraceSink | null = null;

/**
 * Set the global trace sink.
 * Pass null to disable tracing.
 *
 * @param sink - Function to receive trace spans, or null to disable
 *
 * @example
 * ```typescript
 * // Enable console tracing
 * setTraceSink((span) => {
 *   console.log('[TRACE]', span);
 * });
 *
 * // Disable tracing
 * setTraceSink(null);
 * ```
 */
export function setTraceSink(sink: TraceSink | null): void {
  traceSink = sink;
}

/**
 * Get the current trace sink (for testing).
 */
export function getTraceSink(): TraceSink | null {
  return traceSink;
}

/**
 * Redact sensitive information from a string.
 * Redacts tokens, credentials, and full URLs.
 *
 * @param value - String to redact
 * @returns Redacted string
 */
function redact(value: string | undefined): string | undefined {
  if (!value) return value;

  // Redact tokens (Bearer, nsec, etc.)
  let redacted = value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');
  redacted = redacted.replace(/nsec1[a-z0-9]+/gi, 'nsec[REDACTED]');
  
  // Redact full URLs (keep only protocol and host)
  redacted = redacted.replace(/(https?:\/\/[^\/\s]+)\/[^\s]*/gi, '$1/...');

  return redacted;
}

/**
 * Sanitize a span before emitting (redact sensitive data).
 *
 * @param span - Span to sanitize
 * @returns Sanitized span
 */
function sanitizeSpan(span: TraceSpan): TraceSpan {
  const sanitized = { ...span };
  
  if ('remote' in sanitized && sanitized.remote) {
    (sanitized as RepoSpan | GitSpan).remote = redact(sanitized.remote);
  }
  
  if ('target' in sanitized && sanitized.target) {
    const redacted = redact(sanitized.target);
    if (redacted !== undefined) {
      (sanitized as NetworkSpan).target = redacted;
    }
  }
  
  if (sanitized.err) {
    sanitized.err = redact(sanitized.err);
  }
  
  return sanitized;
}

/**
 * Create a span tracker for an operation.
 * Returns a function to call when the operation completes.
 *
 * @param start - Initial span data (without t1)
 * @returns Function to call when operation completes (with optional error)
 *
 * @example
 * ```typescript
 * const end = span({ type: 'git.fetch', naddr: '...', t0: Date.now() });
 * try {
 *   await fetchOperation();
 *   end(); // Success
 * } catch (error) {
 *   end(error); // Failure
 * }
 * ```
 */
export function span<T extends Omit<TraceSpan, 't1'>>(start: T): (err?: unknown) => void {
  // If tracing is disabled, return a no-op function
  if (!traceSink) {
    return () => {};
  }

  const t0 = start.t0;

  return (err?: unknown) => {
    if (!traceSink) return;

    const t1 = Date.now();
    const errStr = err ? (err instanceof Error ? err.message : String(err)) : undefined;

    const completedSpan: TraceSpan = {
      ...start,
      t1,
      err: errStr,
    } as TraceSpan;

    // Sanitize and emit
    traceSink(sanitizeSpan(completedSpan));
  };
}

/**
 * Convenience function to trace a repository operation.
 */
export function traceRepo(
  type: RepoSpan['type'],
  naddr: string,
  remote?: string
): (err?: unknown) => void {
  return span({
    type,
    naddr,
    remote,
    t0: Date.now(),
  });
}

/**
 * Convenience function to trace a Git operation.
 */
export function traceGit(
  type: GitSpan['type'],
  naddr: string,
  ref?: string,
  remote?: string
): (err?: unknown) => void {
  return span({
    type,
    naddr,
    ref,
    remote,
    t0: Date.now(),
  });
}

/**
 * Convenience function to trace a network operation.
 */
export function traceNetwork(
  type: NetworkSpan['type'],
  target: string,
  naddr?: string
): (err?: unknown) => void {
  return span({
    type,
    target,
    naddr,
    t0: Date.now(),
  });
}

/**
 * Create a console trace sink for development.
 * Formats spans in a human-readable way.
 */
export function createConsoleSink(): TraceSink {
  return (span: TraceSpan) => {
    const duration = span.t1 ? `${span.t1 - span.t0}ms` : 'pending';
    const status = span.err ? '❌ ERROR' : '✅ OK';
    const error = span.err ? ` - ${span.err}` : '';

    const details: Record<string, any> = {
      naddr: span.naddr,
    };
    
    if ('ref' in span) {
      details.ref = span.ref;
    }
    
    if ('remote' in span) {
      details.remote = span.remote;
    }
    
    if ('target' in span) {
      details.target = span.target;
    }
    
    console.log(
      `[TRACE] ${status} ${span.type} (${duration})${error}`,
      details
    );
  };
}

/**
 * Create a store-based trace sink for UI timelines.
 * Stores spans in an array that can be displayed in the UI.
 */
export function createStoreSink(store: TraceSpan[]): TraceSink {
  return (span: TraceSpan) => {
    store.push(span);
    // Keep only last 100 spans to avoid memory issues
    if (store.length > 100) {
      store.shift();
    }
  };
}
