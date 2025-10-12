/**
 * Nostr Event I/O adapter types - CLEAN VERSION
 * These define the contract between @nostr-git components and the host app's Nostr I/O layer.
 * 
 * These types are framework-agnostic and can be used with any Nostr application.
 * 
 * IMPORTANT: This is the CLEAN interface that uses closures instead of passing signers around.
 */

import type { NostrEvent } from "./nip34.js";
import type { Filter as NostrFilter } from "nostr-tools";

/**
 * Re-export NostrFilter from nostr-tools for convenience.
 * This is the canonical filter type used across the Nostr ecosystem.
 */
export type { NostrFilter };

/**
 * Result returned after publishing an event.
 */
export type PublishResult = {
  ok: boolean;
  relays?: string[];
  error?: string;
};

/**
 * Event I/O interface that uses closures instead of passing signers around.
 * This eliminates the anti-pattern of passing signers to workers and complex message passing.
 * 
 * The key difference: publishEvent takes unsigned events and handles signing internally.
 */
export interface EventIO {
  /**
   * Fetch events matching the given filters from relays.
   * Should use the host app's existing relay pool/connection manager.
   */
  fetchEvents: (filters: NostrFilter[]) => Promise<NostrEvent[]>;

  /**
   * Publish an unsigned event (handles signing internally).
   * This is the key improvement - no more passing signers around!
   */
  publishEvent: (event: Omit<NostrEvent, "id" | "pubkey" | "sig">) => Promise<PublishResult>;
  
  /**
   * Publish multiple unsigned events in batch.
   */
  publishEvents: (events: Omit<NostrEvent, "id" | "pubkey" | "sig">[]) => Promise<PublishResult[]>;
  
  /**
   * Get the current user's pubkey.
   */
  getCurrentPubkey: () => string | null;
}

/**
 * Legacy EventIO interface - DEPRECATED
 * This is kept only for backward compatibility during migration.
 * All new code should use EventIO.
 * 
 * @deprecated Use EventIO instead
 */
export interface LegacyEventIO {
  fetchEvents: (filters: NostrFilter[]) => Promise<NostrEvent[]>;
  publishEvent: (evt: NostrEvent) => Promise<PublishResult>;
}

/**
 * Legacy SignEvent type - DEPRECATED
 * This is kept only for backward compatibility during migration.
 * All new code should use EventIO which handles signing internally.
 * 
 * @deprecated Use EventIO instead
 */
export type SignEvent = (
  unsigned: Omit<NostrEvent, "id" | "pubkey" | "sig">
) => Promise<NostrEvent>;
