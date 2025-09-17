// NIP-22: Comment Event Types for Nostr
// https://github.com/nostr-protocol/nips/blob/master/22.md

import {NostrEvent} from "nostr-tools"

// -------------------
// Comment Event (kind: 1111)
// -------------------

/**
 * NIP-22 Comment event tag types.
 * See: https://github.com/nostr-protocol/nips/blob/master/22.md
 */
export type CommentTag =
  // Root scope references (must use uppercase for root)
  | ["A", string, ...string[]] // Root address (e.g., 30023:pubkey:identifier)
  | ["E", string, ...string[]] // Root event id
  | ["I", string, ...string[]] // Root external id (e.g., url, podcast guid)
  | ["K", string] // Root kind (number or string)
  | ["P", string, ...string[]] // Root pubkey
  | ["R", string] // Root relay

  // Parent references (must use lowercase for parent)
  | ["a", string, ...string[]] // Parent address
  | ["e", string, ...string[]] // Parent event id
  | ["i", string, ...string[]] // Parent external id
  | ["k", string] // Parent kind
  | ["p", string, ...string[]] // Parent pubkey
  | ["r", string] // Parent relay

  // Optional: citation and mention tags per NIP-21
  | ["q", string, ...string[]] // Cited event or address
  | ["p", string, ...string[]] // Mentioned pubkey

/**
 * NIP-22 Comment Event
 */
export type CommentEvent = NostrEvent & {
  kind: 1111
  content: string
  tags: CommentTag[]
  sig?: string | undefined
}

export interface CreateCommentOpts {
  content: string
  root: {type: "A" | "E" | "I"; value: string; kind: string; pubkey?: string; relay?: string}
  parent?: {type: "a" | "e" | "i"; value: string; kind: string; pubkey?: string; relay?: string}
  authorPubkey?: string
  created_at?: number
  id?: string
  extraTags?: CommentTag[]
}

/**
 * Create a NIP-22 Comment Event (kind 1111) with developer-friendly API.
 */
export function createCommentEvent(opts: CreateCommentOpts): CommentEvent {
  const tags: CommentTag[] = []

  // Add root reference tag
  const {
    type: rootType,
    value: rootValue,
    kind: rootKind,
    pubkey: rootPubkey,
    relay: rootRelay,
  } = opts.root
  tags.push([rootType, rootValue])
  if (rootKind) tags.push(["K", rootKind])
  if (rootPubkey) tags.push(["P", rootPubkey])
  if (rootRelay) tags.push(["R", rootRelay])

  // Add parent reference tag if provided
  if (opts.parent) {
    const {
      type: parentType,
      value: parentValue,
      kind: parentKind,
      pubkey: parentPubkey,
      relay: parentRelay,
    } = opts.parent
    tags.push([parentType, parentValue])
    if (parentKind) tags.push(["k", parentKind])
    if (parentPubkey) tags.push(["p", parentPubkey])
    if (parentRelay) tags.push(["r", parentRelay])
  }

  // Add any extra tags
  if (opts.extraTags) {
    tags.push(...opts.extraTags)
  }

  return {
    kind: 1111,
    content: opts.content,
    tags,
    pubkey: opts.authorPubkey || "",
    created_at: opts.created_at || Math.floor(Date.now() / 1000),
    id: opts.id || "",
    sig: "",
  }
}
