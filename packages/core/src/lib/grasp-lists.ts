import type { NostrEvent } from '@nostr-git/shared-types';

export const GRASP_SET_KIND = 30002; // NIP-51 set kind per app convention
export const DEFAULT_GRASP_SET_ID = 'grasp-servers';

export function validateGraspServerUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Allow ws(s) and http(s) because GRASP may use both for different endpoints
    return ['ws:', 'wss:', 'http:', 'https:'].includes(u.protocol);
  } catch (_) {
    return false;
  }
}

export function normalizeGraspServerUrl(url: string): string {
  // trim and remove trailing slashes
  return url.trim().replace(/\/$/, '');
}

export function makeGraspServersUnsignedEvent(opts: {
  pubkey: string;
  urls: string[];
  identifier?: string; // NIP-51 d-tag value
  created_at?: number;
}): { kind: number; created_at: number; tags: string[][]; content: string } {
  const { pubkey, urls, identifier = DEFAULT_GRASP_SET_ID } = opts;
  const created_at = opts.created_at ?? Math.floor(Date.now() / 1000);

  const clean = Array.from(new Set(urls.map(normalizeGraspServerUrl))).filter(
    validateGraspServerUrl
  );
  const content = JSON.stringify({ urls: clean });
  const tags: string[][] = [
    ['d', identifier],
    // Optional: include owner for clarity (not required for parameterized replaceable)
    ['author', pubkey]
  ];
  return { kind: GRASP_SET_KIND, created_at, tags, content };
}

// Parse a GRASP servers set event content into validated, normalized URLs
export function parseGraspServersEvent(evt: NostrEvent): string[] {
  try {
    const parsed = JSON.parse(evt.content);
    const urls: string[] = Array.isArray(parsed?.urls) ? parsed.urls : [];
    return urls.map(normalizeGraspServerUrl).filter(validateGraspServerUrl);
  } catch (_) {
    return [];
  }
}
