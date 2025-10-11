/**
 * Deprecation warnings for old repository key formats.
 *
 * This module helps track and warn about usage of deprecated key formats
 * (e.g., 30617.id, non-naddr formats) to aid migration.
 */

/**
 * Set of keys that have already been warned about (to avoid spam).
 */
const warnedKeys = new Set<string>();

/**
 * Detect if a key appears to be in a deprecated format.
 *
 * @param key - Repository key to check
 * @returns true if key appears to be deprecated format
 */
export function isDeprecatedKeyFormat(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  const trimmed = key.trim();

  // Check for 30617.id pattern (old event ID usage)
  if (/^30617\.[a-f0-9]{64}$/i.test(trimmed)) {
    return true;
  }

  // Check for bare event IDs (64 hex chars that aren't pubkeys in context)
  // This is heuristic - we can't definitively distinguish pubkey from event ID
  // without context, but event IDs as repo keys are deprecated
  if (/^[a-f0-9]{64}$/i.test(trimmed) && !trimmed.includes('/')) {
    // Could be pubkey or event ID - we'll warn conservatively
    // Only warn if it's being used as a repo key (not as part of npub/name)
    return false; // Let normalizeRepoKey handle this
  }

  // Check for other non-standard formats
  // Standard formats: naddr1..., npub1.../name, pubkey/name, nip-05/name
  const isStandard =
    trimmed.startsWith('naddr1') ||
    trimmed.startsWith('npub1') ||
    trimmed.includes('@') || // nip-05
    (trimmed.includes('/') && /^[0-9a-f]{64}\//i.test(trimmed)); // pubkey/name

  return !isStandard;
}

/**
 * Log a deprecation warning for a key format.
 * Only warns once per unique key to avoid spam.
 *
 * @param key - Deprecated key that was encountered
 * @param context - Optional context about where the key was used
 */
export function warnDeprecatedKey(key: string, context?: string): void {
  if (!key || warnedKeys.has(key)) {
    return;
  }

  warnedKeys.add(key);

  const contextStr = context ? ` (context: ${context})` : '';
  console.warn(
    `[DEPRECATION] Repository key format is deprecated: "${key}"${contextStr}\n` +
    `  Expected formats: naddr, npub/name, pubkey/name, or nip-05/name\n` +
    `  Migration: Use normalizeRepoKey() to convert to canonical naddr format\n` +
    `  See: docs/git-interface/MIGRATION.md`
  );
}

/**
 * Check a key and warn if it's deprecated.
 * Convenience function combining detection and warning.
 *
 * @param key - Repository key to check
 * @param context - Optional context about where the key was used
 * @returns true if key is deprecated
 */
export function checkAndWarnDeprecated(key: string, context?: string): boolean {
  const isDeprecated = isDeprecatedKeyFormat(key);
  if (isDeprecated) {
    warnDeprecatedKey(key, context);
  }
  return isDeprecated;
}

/**
 * Clear the warned keys set (useful for testing).
 */
export function clearWarnedKeys(): void {
  warnedKeys.clear();
}

/**
 * Get the set of keys that have been warned about (useful for testing/debugging).
 */
export function getWarnedKeys(): ReadonlySet<string> {
  return warnedKeys;
}
