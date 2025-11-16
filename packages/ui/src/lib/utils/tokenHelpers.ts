import type { Token } from "../stores/tokens.js";

/**
 * Try all tokens for a given host until one succeeds.
 * This is useful when multiple tokens exist for the same host (e.g., multiple GitHub tokens).
 *
 * @param tokens - Array of tokens to try
 * @param hostMatcher - Function that returns true if a token's host matches
 * @param operation - Async function that takes a token and host, and returns a result
 * @returns Promise that resolves with the first successful result
 * @throws Error if all tokens fail
 */
export async function tryTokensForHost<T>(
  tokens: Token[],
  hostMatcher: (host: string) => boolean,
  operation: (token: string, host: string) => Promise<T>
): Promise<T> {
  const matchingTokens = tokens.filter((t) => hostMatcher(t.host));

  if (matchingTokens.length === 0) {
    throw new Error("No tokens found for the specified host");
  }

  const errors: Error[] = [];

  for (const tokenEntry of matchingTokens) {
    try {
      console.log(`🔐 Trying token for host ${tokenEntry.host}...`);
      const result = await operation(tokenEntry.token, tokenEntry.host);
      console.log(`🔐 Token succeeded for host ${tokenEntry.host}`);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`🔐 Token failed for host ${tokenEntry.host}:`, err.message);
      errors.push(err);
      // Continue to next token
    }
  }

  // All tokens failed
  const errorMessages = errors.map((e, i) => `Token ${i + 1}: ${e.message}`).join("; ");
  throw new Error(`All tokens failed for host. Errors: ${errorMessages}`);
}

/**
 * Get all tokens matching a host.
 * This is a simpler version for cases where we just need to find tokens.
 *
 * @param tokens - Array of tokens to search
 * @param hostMatcher - Function that returns true if a token's host matches
 * @returns Array of matching tokens
 */
export function getTokensForHost(tokens: Token[], hostMatcher: (host: string) => boolean): Token[] {
  return tokens.filter((t) => hostMatcher(t.host));
}
