// Core: canonical repo key helpers
// Existing simple helper (kept for backward compatibility)

function canonicalRepoKeyInternal(args: { npub: string; name?: string }): string {
  const npub = args.npub?.trim();
  const name = args.name?.trim();
  if (!npub) throw new Error('canonicalRepoKey: npub is required');
  return name ? `${npub}/${name}` : npub;
}

export function warnIfLegacyRepoKey(key: string): void {
  // Heuristic: legacy keys looked like numeric kind-id or event id based strings
  if (/^[0-9a-f]{64}$/.test(key) || /^30617:/.test(key)) {
    // eslint-disable-next-line no-console
    console.warn('Deprecated repo key detected. Use canonical npub/name. Key:', key);
  }
}

// ---------------------------------------------------------------------------
// Flexible normalization

export type RepoKeyPreference = 'npub' | 'nip05' | 'naddr';

export type RepoKeyResolvers = {
  verifyNip05?: (nip05: string) => Promise<boolean>;
  nip05ToPubkey?: (nip05: string) => Promise<string | null>;
  pubkeyToNip05?: (pubkey: string) => Promise<string | null>;
  encodeNaddr?: (pubkey: string, identifier: string, kind?: number, relays?: string[]) => string;
  decodeNaddr?: (
    naddr: string
  ) => { pubkey: string; identifier: string; kind?: number; relays?: string[] } | null;
};

export type ParsedRepoKey =
  | { type: 'npub'; npub: string; name?: string }
  | { type: 'nip05'; nip05: string; name?: string }
  | {
      type: 'naddr';
      naddr: string;
      pubkey: string;
      identifier: string;
      kind?: number;
      relays?: string[];
    };

function isNpub(s: string): boolean {
  return s.startsWith('npub1');
}

function parseInput(input: string, io: RepoKeyResolvers): ParsedRepoKey | null {
  const s = input.trim();
  // naddr only
  if (s.startsWith('naddr1')) {
    const dec = io.decodeNaddr?.(s);
    if (!dec) return null;
    return {
      type: 'naddr',
      naddr: s,
      pubkey: dec.pubkey,
      identifier: dec.identifier,
      kind: dec.kind,
      relays: dec.relays
    };
  }
  // split paths: something/name
  const parts = s.split('/');
  if (parts.length >= 2) {
    const owner = parts[0];
    const name = parts.slice(1).join('/');
    if (isNpub(owner)) return { type: 'npub', npub: owner, name };
    if (owner.includes('.')) return { type: 'nip05', nip05: owner, name };
  }
  // bare npub
  if (isNpub(s)) return { type: 'npub', npub: s };
  return null;
}

/**
 * Normalize a user-visible repo key to a preferred canonical form using injected resolvers.
 * - input accepts: npub[/name], nip05[/name] (only if verifyNip05 resolves true), or naddr
 * - pref chooses output shape: 'npub' => npub/name; 'nip05' => nip05/name; 'naddr' => naddr
 * - IO/resolvers provide conversion without introducing network calls in leaf modules.
 */
export async function normalizeRepoKeyFlexible(
  input: string,
  pref: RepoKeyPreference,
  io: RepoKeyResolvers
): Promise<string> {
  const parsed = parseInput(input, io);
  if (!parsed) return input;

  let npub =
    parsed.type === 'npub' ? parsed.npub : parsed.type === 'naddr' ? parsed.pubkey : undefined;
  let name = parsed.type === 'naddr' ? parsed.identifier : parsed.name;
  let nip05 = parsed.type === 'nip05' ? parsed.nip05 : undefined;

  // Handle nip05 verification and conversion if needed
  if (parsed.type === 'nip05') {
    const verified = (await io.verifyNip05?.(parsed.nip05)) ?? false;
    if (!verified) {
      // If not verified, fall back to npub form if resolvable; otherwise keep input as-is
      const pk = (await io.nip05ToPubkey?.(parsed.nip05)) || undefined;
      if (pk) npub = pk;
    } else {
      // Verified: try to resolve to pubkey as well for internal normalization
      const pk = (await io.nip05ToPubkey?.(parsed.nip05)) || undefined;
      if (pk) npub = pk;
    }
  }

  // Produce preferred output
  if (pref === 'naddr') {
    if (!npub || !name) return input; // cannot encode
    const n = io.encodeNaddr?.(npub, name);
    return n || input;
  }

  if (pref === 'nip05') {
    if (!nip05) {
      // attempt to derive nip05 from pubkey if resolver provided
      if (npub) nip05 = (await io.pubkeyToNip05?.(npub)) || undefined;
    }
    if (nip05) return name ? `${nip05}/${name}` : nip05;
    // fallback to npub form
  }

  // default npub form
  if (npub) return name ? `${npub}/${name}` : npub;
  return input;
}
