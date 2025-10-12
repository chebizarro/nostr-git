/**
 * Clean Event Publishing Interface
 * 
 * This eliminates the anti-pattern of passing signers around.
 * Instead, we use closures that capture the signing context.
 */

import type { NostrEvent, PublishResult } from "@nostr-git/shared-types";

/**
 * A closure-based event publisher that handles signing and publishing.
 * The closure captures all the necessary context (signer, relays, etc.)
 * so the caller doesn't need to know about these details.
 */
export type EventPublisher = (event: Omit<NostrEvent, "id" | "pubkey" | "sig">) => Promise<PublishResult>;

/**
 * Creates an EventPublisher closure that captures the signing and publishing context.
 * 
 * @param signEvent - Function that signs events (captures signer context)
 * @param publishEvent - Function that publishes events (captures relay context)
 * @returns EventPublisher closure
 */
export function createEventPublisher(
  signEvent: (event: Omit<NostrEvent, "id" | "pubkey" | "sig">) => Promise<NostrEvent>,
  publishEvent: (event: NostrEvent) => Promise<PublishResult>
): EventPublisher {
  return async (unsignedEvent: Omit<NostrEvent, "id" | "pubkey" | "sig">): Promise<PublishResult> => {
    console.log('[EventPublisher] Publishing event:', {
      kind: unsignedEvent.kind,
      created_at: unsignedEvent.created_at,
      tagCount: unsignedEvent.tags.length,
    });

    try {
      // Sign the event using the captured signer context
      const signedEvent = await signEvent(unsignedEvent);
      
      console.log('[EventPublisher] Event signed successfully:', {
        id: signedEvent.id,
        pubkey: signedEvent.pubkey,
      });

      // Publish the event using the captured relay context
      const result = await publishEvent(signedEvent);
      
      console.log('[EventPublisher] Event published:', {
        success: result.ok,
        eventId: signedEvent.id,
      });

      return result;
    } catch (error) {
      console.error('[EventPublisher] Failed to publish event:', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

/**
 * Creates a batch EventPublisher that publishes multiple events.
 * 
 * @param eventPublisher - Single event publisher
 * @returns Function that publishes multiple events
 */
export function createBatchEventPublisher(
  eventPublisher: EventPublisher
): (events: Omit<NostrEvent, "id" | "pubkey" | "sig">[]) => Promise<PublishResult[]> {
  return async (events: Omit<NostrEvent, "id" | "pubkey" | "sig">[]): Promise<PublishResult[]> => {
    console.log('[BatchEventPublisher] Publishing', events.length, 'events');
    
    const results = await Promise.allSettled(
      events.map(event => eventPublisher(event))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`[BatchEventPublisher] Event ${index} failed:`, result.reason);
        return {
          ok: false,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
      }
    });
  };
}

/**
 * Creates a retry-enabled EventPublisher that retries failed publishes.
 * 
 * @param eventPublisher - Base event publisher
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param retryDelay - Delay between retries in ms (default: 1000)
 * @returns EventPublisher with retry logic
 */
export function createRetryEventPublisher(
  eventPublisher: EventPublisher,
  maxRetries: number = 3,
  retryDelay: number = 1000
): EventPublisher {
  return async (event: Omit<NostrEvent, "id" | "pubkey" | "sig">): Promise<PublishResult> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await eventPublisher(event);
        
        if (result.ok) {
          if (attempt > 0) {
            console.log(`[RetryEventPublisher] Event published successfully on attempt ${attempt + 1}`);
          }
          return result;
        }
        
        lastError = new Error(result.error || 'Publish failed');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
      
      if (attempt < maxRetries) {
        console.log(`[RetryEventPublisher] Attempt ${attempt + 1} failed, retrying in ${retryDelay}ms:`, lastError?.message);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    console.error(`[RetryEventPublisher] All ${maxRetries + 1} attempts failed`);
    return {
      ok: false,
      error: lastError?.message || 'All retry attempts failed',
    };
  };
}
