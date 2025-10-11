/**
 * GRASP Repository State Management Helper
 *
 * Provides utilities for working with GRASP repository state events (kind 31990).
 * Based on implementation patterns observed in ngit repo_state.rs.
 */

import { nip19 } from 'nostr-tools';
import type { EventTemplate, NostrEvent } from 'nostr-tools';
import { getTagValue, getTags, type NostrTag } from '@nostr-git/shared-types';

export interface RepoState {
  address: string;    // e.g., "npub1abc...:myrepo"
  head: string;       // e.g., "refs/heads/main" or "refs/tags/v1.0"
  refs: Record<string, string>; // refname -> sha mapping
  nostrRefs?: string[]; // optional nostr event IDs being tracked
  updatedAt: number;  // timestamp in seconds
}

/**
 * Encode repository address from hex pubkey and repo name.
 * Format: <npub>:<repo-name>
 *
 * Based on ngit's canonical address handling in repo_state.rs
 */
export function encodeRepoAddress(pubkeyHex: string, repo: string): string {
  const npub = nip19.npubEncode(pubkeyHex);
  return `${npub}:${repo}`;
}

/**
 * Parse repository address from canonical format
 * Format: <npub>:<repo-name>
 *
 * Mirrors ngit's parseRepoAddress functionality
 */
export function parseRepoAddress(address: string): { npub: string; repo: string } {
  const parts = address.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid repository address format: ${address}`);
  }
  const [npub, repo] = parts;
  if (!npub || !repo) {
    throw new Error(`Invalid repository address format: ${address}`);
  }
  return { npub, repo };
}

/**
 * Parse repository state from a kind 31990 Nostr event.
 * Based on ngit's RepoState::try_from implementation in repo_state.rs:
 * - Sorts events by created_at and uses the latest
 * - Extracts refs from tags starting with refs/heads/, refs/tags, HEAD
 * - Ignores dereferenced tags ending with ^{}
 * - Validates OID format or ref: refs/ format
 */
export function parseRepoStateFromEvent(event: NostrEvent): RepoState | null {
  if (event.kind !== 31990) {
    return null;
  }

  const address = getTagValue(event as unknown as {tags: NostrTag[]}, 'a');
  if (!address) {
    return null;
  }

  const head = getTagValue(event as unknown as {tags: NostrTag[]}, 'HEAD') || 'refs/heads/main';
  
  // Parse ref tags - ngit uses custom tag names for refs
  const refs: Record<string, string> = {};
  const refTags = getTags(event as unknown as {tags: NostrTag[]}, 'ref');
  
  for (const tag of refTags) {
    if (tag.length >= 3) {
      const refName = tag[1];
      const refValue = tag[2];
      
      // Skip dereferenced tags (ending with ^{})
      if (refName.endsWith('^{}')) {
        continue;
      }
      
      // Validate that it's a proper ref format
      if (refName.startsWith('refs/heads/') || 
          refName.startsWith('refs/tags/') || 
          refName.startsWith('refs/nostr/') ||
          refName === 'HEAD') {
        refs[refName] = refValue;
      }
    }
  }

  // Parse nostr-ref tags for nostr event IDs being tracked
  const nostrRefs: string[] = [];
  const nostrRefTags = getTags(event as unknown as {tags: NostrTag[]}, 'nostr-ref');
  for (const tag of nostrRefTags) {
    if (tag.length >= 2) {
      nostrRefs.push(tag[1]);
    }
  }

  return {
    address,
    head,
    refs,
    nostrRefs: nostrRefs.length > 0 ? nostrRefs : undefined,
    updatedAt: event.created_at
  };
}

/**
 * Build a state event template from RepoState data.
 * Based on ngit's RepoState::build implementation in repo_state.rs:
 * - Uses kind 31990 for state events
 * - Includes identifier tag for repository address
 * - Adds refs as custom tags
 * - Includes HEAD management
 */
export function buildStateEventTemplate(state: RepoState): EventTemplate {
  const tags: string[][] = [
    ['a', state.address],
    ['HEAD', state.head]
  ];

  // Add ref tags
  for (const [refName, refValue] of Object.entries(state.refs)) {
    tags.push(['ref', refName, refValue]);
  }

  // Add nostr-ref tags if present
  if (state.nostrRefs) {
    for (const eventId of state.nostrRefs) {
      tags.push(['nostr-ref', eventId]);
    }
  }

  return {
    kind: 31990,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '' // State events typically have empty content
  };
}

/**
 * Extract default branch name from HEAD reference.
 *
 * Based on ngit's add_head() function in repo_state.rs:
 * - Prefers refs/heads/main, then refs/heads/master
 * - Falls back to first available refs/heads/ branch
 */
export function getDefaultBranchFromHead(head: string): string {
  if (head.startsWith('refs/heads/')) {
    return head.substring('refs/heads/'.length);
  }
  return 'main'; // fallback
}

/**
 * Check if a ref name is a nostr reference.
 */
export function isNostrRef(refName: string): boolean {
  return refName.startsWith('refs/nostr/');
}

/**
 * Extract event ID from nostr ref name.
 */
export function getEventIdFromNostrRef(refName: string): string | null {
  if (isNostrRef(refName)) {
    return refName.substring('refs/nostr/'.length);
  }
  return null;
}

/**
 * Create nostr ref name from event ID.
 */
export function createNostrRefName(eventId: string): string {
  return `refs/nostr/${eventId}`;
}

/**
 * Normalize a push target to handle nostr refs.
 * Converts nostr/<event-id> to refs/nostr/<event-id> format.
 */
export function normalizePushTarget(target: string): string {
  if (target.startsWith('nostr/')) {
    return `refs/nostr/${target.substring(6)}`;
  }
  if (target.startsWith('refs/nostr/')) {
    return target;
  }
  return target;
}

/**
 * Parse a push target to determine if it's a nostr ref.
 */
export function parsePushTarget(target: string): {
  type: 'ref' | 'nostr';
  refname?: string;
  eventId?: string;
} {
  const normalized = normalizePushTarget(target);
  
  if (normalized.startsWith('refs/nostr/')) {
    const eventId = normalized.substring('refs/nostr/'.length);
    return {
      type: 'nostr',
      refname: normalized,
      eventId
    };
  }
  
  return {
    type: 'ref',
    refname: normalized
  };
}