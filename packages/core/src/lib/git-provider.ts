import type { GitProvider } from '@nostr-git/git-wrapper';
import { getGitProvider as getBaseGitProvider } from '@nostr-git/git-wrapper';
import { MultiVendorGitProvider } from './multi-vendor-git-provider.js';
import { NostrGitProvider } from './git/providers/nostr-git-provider.js';
import { createNostrGitProviderFromEnv } from './git/providers/nostr-git-factory.js';
import type { EventIO } from '@nostr-git/shared-types';

// Create the multi-vendor GitProvider instance using git-wrapper factory
let gitProvider: GitProvider = new MultiVendorGitProvider({
  baseProvider: getBaseGitProvider()
});

// NostrGitProvider instance for Nostr-based operations
let nostrGitProvider: NostrGitProvider | null = null;

/**
 * Set a custom GitProvider instance
 */
export function setGitProvider(provider: GitProvider) {
  gitProvider = provider;
}

/**
 * Get the current GitProvider instance
 */
export function getGitProvider(): GitProvider {
  return gitProvider;
}

/**
 * Get the multi-vendor GitProvider instance (with vendor-specific methods)
 * Use this when you need access to vendor-specific operations like getRepoMetadata, forkRemoteRepo, etc.
 */
export function getMultiVendorGitProvider(): MultiVendorGitProvider {
  if (gitProvider instanceof MultiVendorGitProvider) {
    return gitProvider;
  }
  throw new Error('Current GitProvider is not a MultiVendorGitProvider instance');
}

/**
 * Configure authentication tokens for the multi-vendor GitProvider
 */
export function setGitTokens(tokens: Array<{ host: string; token: string }>) {
  const multiVendorProvider = getMultiVendorGitProvider();
  multiVendorProvider.setTokens(tokens);
}

/**
 * Initialize NostrGitProvider with EventIO - CLEAN VERSION
 *
 * This sets up the NostrGitProvider for Nostr-based Git operations.
 * Must be called before using any Nostr-specific functionality.
 * 
 * IMPORTANT: No more Signer passing - EventIO handles signing internally!
 */
export function initializeNostrGitProvider(options: {
  eventIO: EventIO;
}): NostrGitProvider {
  nostrGitProvider = createNostrGitProviderFromEnv(options);
  return nostrGitProvider;
}

/**
 * Get the NostrGitProvider instance
 *
 * Returns the configured NostrGitProvider or throws an error if not initialized.
 */
export function getNostrGitProvider(): NostrGitProvider {
  if (!nostrGitProvider) {
    throw new Error('NostrGitProvider not initialized. Call initializeNostrGitProvider() first.');
  }
  return nostrGitProvider;
}

/**
 * Check if NostrGitProvider is available
 */
export function hasNostrGitProvider(): boolean {
  return nostrGitProvider !== null;
}

/**
 * Get the appropriate GitProvider based on URL
 *
 * Automatically selects between traditional Git providers and NostrGitProvider
 * based on the repository URL.
 */
export function getProviderForUrl(url: string): GitProvider {
  // Check if URL is Nostr-based
  if (url.startsWith('nostr://') || url.includes('relay.ngit.dev') || url.includes('gitnostr.com')) {
    if (!nostrGitProvider) {
      throw new Error('NostrGitProvider not initialized for Nostr-based repository');
    }
    // Return the underlying GitProvider from NostrGitProvider
    return nostrGitProvider.getGitProvider();
  }
  
  // Use traditional provider for other URLs
  return gitProvider;
}
