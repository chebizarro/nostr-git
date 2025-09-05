// Core: canonical repo key helpers
// Canonical repo key is npub/name (fallback npub)

export function canonicalRepoKey(args: { npub: string; name?: string }): string {
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
