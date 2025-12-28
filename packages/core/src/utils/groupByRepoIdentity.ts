// Group issues and patches by their canonical repository identity (EUC/clone/name)
// Similar to how repo announcements are grouped

import type { IssueEvent, PatchEvent } from '@nostr-git/shared-types';
import { GIT_REPO_ANNOUNCEMENT } from '@nostr-git/shared-types';

/**
 * Extract repository identity from an issue or patch event
 * Returns the canonical key based on EUC, clone URLs, and name
 */
function extractRepoIdentity(event: IssueEvent | PatchEvent): {
  euc?: string;
  cloneUrls: string[];
  name: string;
  repoAddr: string;
} | null {
  // Find the 'a' tag that references the repository (30617:pubkey:name)
  const aTag = event.tags.find(
    (t: string[]) => t[0] === 'a' && t[1]?.startsWith(`${GIT_REPO_ANNOUNCEMENT}:`)
  );
  if (!aTag || !aTag[1]) return null;

  const repoAddr = aTag[1]; // e.g., "30617:pubkey:name"
  const parts = repoAddr.split(':');
  if (parts.length < 3) return null;

  const name = parts.slice(2).join(':'); // Handle names with colons

  // Extract EUC from 'r' tags with 'euc' marker
  const eucTag = event.tags.find((t: string[]) => t[0] === 'r' && t[2] === 'euc');
  const euc = eucTag?.[1];

  // Extract clone URLs from 'r' tags (those without 'euc' marker are typically clone URLs)
  const cloneUrls = event.tags
    .filter((t: string[]) => t[0] === 'r' && t[2] !== 'euc')
    .map((t: string[]) => t[1])
    .filter(Boolean);

  return { euc, cloneUrls, name, repoAddr };
}

/**
 * Normalize clone URLs for comparison (similar to repo grouping logic)
 */
function normalizeCloneUrls(urls: string[]): string {
  return urls
    .map((url: string) => {
      let normalized = url
        .trim()
        .toLowerCase()
        .replace(/\.git$/, '')
        .replace(/\/$/, '');
      // Replace npub paths with generic placeholder to group by repo name only
      normalized = normalized.replace(/\/npub1[a-z0-9]+\//g, '/{npub}/');
      return normalized;
    })
    .sort()
    .join('|');
}

/**
 * Generate a composite key for grouping (EUC:name:cloneUrls)
 */
function generateCompositeKey(identity: ReturnType<typeof extractRepoIdentity>): string {
  if (!identity) return '';
  const { euc, cloneUrls, name } = identity;
  const normalizedClones = normalizeCloneUrls(cloneUrls);
  return `${euc || ''}:${name}:${normalizedClones}`;
}

/**
 * Group issues by their canonical repository identity
 * Issues from the same repo (identified by EUC/clone/name) will be grouped together
 */
export function groupIssuesByRepoIdentity(issues: IssueEvent[]): Map<string, IssueEvent[]> {
  const grouped = new Map<string, IssueEvent[]>();

  for (const issue of issues) {
    const identity = extractRepoIdentity(issue);
    if (!identity) continue;

    const key = generateCompositeKey(identity);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(issue);
  }

  return grouped;
}

/**
 * Group patches by their canonical repository identity
 * Patches from the same repo (identified by EUC/clone/name) will be grouped together
 */
export function groupPatchesByRepoIdentity(patches: PatchEvent[]): Map<string, PatchEvent[]> {
  const grouped = new Map<string, PatchEvent[]>();

  for (const patch of patches) {
    const identity = extractRepoIdentity(patch);
    if (!identity) continue;

    const key = generateCompositeKey(identity);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(patch);
  }

  return grouped;
}

/**
 * Check if an issue/patch belongs to a specific repository based on canonical identity
 * This allows matching issues/patches to repos even if they have different pubkeys
 * but share the same EUC, clone URLs, and name
 */
export function matchesRepoIdentity(
  event: IssueEvent | PatchEvent,
  repoIdentity: { euc?: string; cloneUrls: string[]; name: string }
): boolean {
  const eventIdentity = extractRepoIdentity(event);
  if (!eventIdentity) return false;

  const eventKey = generateCompositeKey(eventIdentity);
  const repoKey = generateCompositeKey({
    ...repoIdentity,
    repoAddr: '' // Not used in key generation
  });

  return eventKey === repoKey;
}
