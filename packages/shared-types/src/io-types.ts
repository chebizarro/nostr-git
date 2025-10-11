/**
 * Nostr Event I/O adapter types.
 * These define the contract between @nostr-git components and the host app's Nostr I/O layer.
 * 
 * These types are framework-agnostic and can be used with any Nostr application.
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
 * Event I/O interface that the host application must provide.
 * All @nostr-git components receive this via props/context.
 */
export interface EventIO {
  /**
   * Fetch events matching the given filters from relays.
   * Should use the host app's existing relay pool/connection manager.
   */
  fetchEvents: (filters: NostrFilter[]) => Promise<NostrEvent[]>;

  /**
   * Publish a signed event to relays.
   * Should use the host app's existing publish mechanism.
   */
  publishEvent: (evt: NostrEvent) => Promise<PublishResult>;
}

/**
 * Signing function that the host application must provide.
 * Takes an unsigned event template and returns a fully signed event.
 */
export type SignEvent = (
  unsigned: Omit<NostrEvent, "id" | "pubkey" | "sig">
) => Promise<NostrEvent>;
