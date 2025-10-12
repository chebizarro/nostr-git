/**
 * Clean EventIO Interface
 * 
 * This eliminates the anti-pattern of passing signers around.
 * Instead, EventIO is created with a closure that handles signing and publishing.
 */

import type { NostrFilter, NostrEvent, PublishResult } from "@nostr-git/shared-types";
import type { EventPublisher } from "./event-publisher.js";

/**
 * Clean EventIO interface that uses closures instead of passing signers around.
 * 
 * The key difference from the old interface:
 * - publishEvent takes an unsigned event and handles signing internally
 * - No need to pass signers around or register them with workers
 * - The EventIO instance captures all necessary context in closures
 */
export interface EventIO {
  /**
   * Fetch events from relays.
   */
  fetchEvents(filters: NostrFilter[]): Promise<NostrEvent[]>;
  
  /**
   * Publish an unsigned event (handles signing internally).
   * This is the key improvement - no more passing signers around!
   */
  publishEvent(event: Omit<NostrEvent, "id" | "pubkey" | "sig">): Promise<PublishResult>;
  
  /**
   * Publish multiple unsigned events in batch.
   */
  publishEvents(events: Omit<NostrEvent, "id" | "pubkey" | "sig">[]): Promise<PublishResult[]>;
  
  /**
   * Get the current user's pubkey.
   */
  getCurrentPubkey(): string | null;
}

/**
 * Creates a EventIO instance using closures.
 * 
 * @param fetchEvents - Function that fetches events (captures relay context)
 * @param eventPublisher - EventPublisher closure (captures signing + publishing context)
 * @param getCurrentPubkey - Function that gets current pubkey (captures user context)
 * @returns EventIO instance
 */
export function createEventIO(
  fetchEvents: (filters: NostrFilter[]) => Promise<NostrEvent[]>,
  eventPublisher: EventPublisher,
  getCurrentPubkey: () => string | null
): EventIO {
  return {
    fetchEvents,
    
    async publishEvent(event: Omit<NostrEvent, "id" | "pubkey" | "sig">): Promise<PublishResult> {
      return await eventPublisher(event);
    },
    
    async publishEvents(events: Omit<NostrEvent, "id" | "pubkey" | "sig">[]): Promise<PublishResult[]> {
      const results = await Promise.allSettled(
        events.map(event => eventPublisher(event))
      );
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          console.error(`[EventIO] Event ${index} failed:`, result.reason);
          return {
            ok: false,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          };
        }
      });
    },
    
    getCurrentPubkey,
  };
}

/**
 * Legacy EventIO interface for backward compatibility.
 * This will be deprecated once all code is migrated to EventIO.
 */
export interface LegacyEventIO {
  fetchEvents(filters: NostrFilter[]): Promise<NostrEvent[]>;
  publishEvent(event: NostrEvent): Promise<PublishResult>;
}

/**
 * Adapter that converts EventIO to LegacyEventIO for backward compatibility.
 * This allows gradual migration without breaking existing code.
 */
export function createLegacyEventIOAdapter(cleanEventIO: EventIO): LegacyEventIO {
  return {
    async fetchEvents(filters: NostrFilter[]): Promise<NostrEvent[]> {
      return await cleanEventIO.fetchEvents(filters);
    },
    
    async publishEvent(event: NostrEvent): Promise<PublishResult> {
      // Extract the unsigned parts
      const { id, pubkey, sig, ...unsignedEvent } = event;
      
      // Use the clean interface
      return await cleanEventIO.publishEvent(unsignedEvent);
    },
  };
}
