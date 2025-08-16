import { z } from 'zod';

// A Nostr tag is a tuple where the first element is the tag name and
// subsequent elements are string values. Example: ["e", "<event-id>"]
export const NostrTagSchema = z.tuple([z.string()]).rest(z.string());
export type NostrTagRuntime = z.infer<typeof NostrTagSchema>;

// A minimal Nostr event-like shape that we can validate at runtime.
export const NostrEventSchema = z.object({
  id: z.string().optional(),
  kind: z.number().optional(),
  content: z.string().optional(),
  tags: z.array(NostrTagSchema),
  created_at: z.number().int().optional(),
  pubkey: z.string().optional(),
  sig: z.string().optional()
});
export type NostrEventLike = z.infer<typeof NostrEventSchema>;

// Narrow-only function: throws if tags are not valid Nostr tags.
export function assertValidTags(event: { tags: unknown }): asserts event is { tags: NostrTagRuntime[] } {
  const res = z.array(NostrTagSchema).safeParse(event.tags);
  if (!res.success) {
    throw new Error(`Invalid event.tags: ${res.error.message}`);
  }
}

// Safe parse helper to validate tags and obtain parsed value or error.
export function safeParseEventTags(event: { tags: unknown }) {
  return z.array(NostrTagSchema).safeParse(event.tags);
}
