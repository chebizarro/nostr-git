import type { GitProvider } from '@nostr-git/git-wrapper';
import { MultiVendorGitProvider } from './multi-vendor-git-provider.js';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';

// Create the multi-vendor GitProvider instance
let gitProvider: GitProvider = new MultiVendorGitProvider({
  fs: new LightningFS('nostr-git'),
  http: http,
  corsProxy: 'https://cors.isomorphic-git.org',
});

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
