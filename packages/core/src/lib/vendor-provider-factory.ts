import type { VendorProvider, GitVendor } from './vendor-providers.js';
import { detectVendorFromUrl, extractHostname } from './vendor-providers.js';
import { GitHubProvider } from './vendors/github-provider.js';
import { GitLabProvider } from './vendors/gitlab-provider.js';
import { GenericProvider } from './vendors/generic-provider.js';

// Registry of vendor providers
const providerRegistry = new Map<string, VendorProvider>();

// Provider overrides for custom hostnames (useful for testing/enterprise)
const providerOverrides = new Map<string, GitVendor>();

/**
 * Register a custom provider override for a hostname
 * Useful for enterprise installations or testing
 */
export function registerProviderOverride(hostname: string, vendor: GitVendor): void {
  providerOverrides.set(hostname.toLowerCase(), vendor);
}

/**
 * Clear all provider overrides
 */
export function clearProviderOverrides(): void {
  providerOverrides.clear();
}

/**
 * Get or create a vendor provider for the given URL
 */
export function resolveVendorProvider(url: string): VendorProvider {
  const hostname = extractHostname(url).toLowerCase();
  
  // Check if we already have a provider for this hostname
  if (providerRegistry.has(hostname)) {
    return providerRegistry.get(hostname)!;
  }

  // Check for provider overrides first
  const overrideVendor = providerOverrides.get(hostname);
  const vendor = overrideVendor || detectVendorFromUrl(url);

  // Create the appropriate provider
  let provider: VendorProvider;
  
  switch (vendor) {
    case 'github':
      provider = new GitHubProvider(hostname);
      break;
    case 'gitlab':
      provider = new GitLabProvider(hostname);
      break;
    case 'gitea':
      // Gitea uses GitLab-compatible API in many cases
      provider = new GitLabProvider(hostname);
      break;
    case 'bitbucket':
      // For now, treat Bitbucket as generic (could implement BitbucketProvider later)
      provider = new GenericProvider(hostname);
      break;
    default:
      provider = new GenericProvider(hostname);
      break;
  }

  // Cache the provider
  providerRegistry.set(hostname, provider);
  
  return provider;
}

/**
 * Get vendor provider for a specific vendor type and hostname
 */
export function getVendorProvider(vendor: GitVendor, hostname: string): VendorProvider {
  const key = `${vendor}:${hostname.toLowerCase()}`;
  
  if (providerRegistry.has(key)) {
    return providerRegistry.get(key)!;
  }

  let provider: VendorProvider;
  
  switch (vendor) {
    case 'github':
      provider = new GitHubProvider(hostname);
      break;
    case 'gitlab':
      provider = new GitLabProvider(hostname);
      break;
    case 'gitea':
      provider = new GitLabProvider(hostname);
      break;
    case 'bitbucket':
      provider = new GenericProvider(hostname);
      break;
    default:
      provider = new GenericProvider(hostname);
      break;
  }

  providerRegistry.set(key, provider);
  return provider;
}

/**
 * Parse repository information from URL using the appropriate vendor provider
 */
export function parseRepoFromUrl(url: string): { 
  provider: VendorProvider; 
  owner: string; 
  repo: string; 
} | null {
  const provider = resolveVendorProvider(url);
  const parsed = provider.parseRepoUrl(url);
  
  if (!parsed) {
    return null;
  }

  return {
    provider,
    owner: parsed.owner,
    repo: parsed.repo
  };
}

/**
 * Clear the provider registry (useful for testing)
 */
export function clearProviderRegistry(): void {
  providerRegistry.clear();
}
