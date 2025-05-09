import { type EventTemplate, type NostrEvent } from 'nostr-tools';
export type HexString = Uint8Array<ArrayBufferLike>;
/**
 * Creates a NIP-34 permalink event from a URL
 *
 * @param permalink - The permalink, as copied directly from GitHub/Gitea/GitLab.
 * @param sk - The secret key to sign the event with.
 * @param relays - The relays to query for existing git repos
 * @returns a signed permalink @NostrEvent
 */
export declare function createEventFromPermalink(permalink: string, signer: (event: EventTemplate) => Promise<NostrEvent>, relays: string[]): Promise<NostrEvent>;
export declare function createNeventFromPermalink(permalink: string, signer: (event: EventTemplate) => Promise<NostrEvent>, relays: string[]): Promise<string>;
