/**
 * NostrGitProvider Factory
 * 
 * Factory for creating NostrGitProvider instances with proper configuration.
 * Handles provider selection logic and dependency injection.
 * 
 * Based on ngit's client.rs factory patterns and configuration management.
 */

import type { EventIO } from '@nostr-git/shared-types';

// Define Signer interface locally
interface Signer {
  signEvent(event: any): Promise<any>;
  getPublicKey(): Promise<string>;
}
import { NostrGitProvider, type NostrGitConfig } from './nostr-git-provider.js';
import { GraspApi, type GraspApiConfig } from './grasp-api.js';

/**
 * Factory configuration options
 */
export interface NostrGitFactoryOptions {
  /** Nostr event I/O interface */
  eventIO: EventIO;
  /** Nostr signer for creating events */
  signer: Signer;
  /** Default relay URLs */
  defaultRelays?: string[];
  /** Fallback relay URLs */
  fallbackRelays?: string[];
  /** GRASP relay URLs */
  graspRelays?: string[];
  /** Whether to enable GRASP integration */
  enableGrasp?: boolean;
  /** Whether to publish repo state by default */
  publishRepoState?: boolean;
  /** Whether to publish repo announcements by default */
  publishRepoAnnouncements?: boolean;
  /** CORS proxy URL for HTTP operations */
  corsProxy?: string;
  /** Default timeout for operations */
  timeoutMs?: number;
}

/**
 * Default relay configuration
 * Based on ngit's default relay sets
 */
export const DEFAULT_RELAYS = {
  default: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
  ],
  fallback: [
    'wss://purplerelay.com',
    'wss://purplepages.es',
    'wss://relayable.org'
  ],
  grasp: [
    'wss://relay.ngit.dev',
    'wss://gitnostr.com'
  ]
};

/**
 * Create a NostrGitProvider instance
 * 
 * This factory method creates a properly configured NostrGitProvider
 * with GRASP integration and multi-relay support.
 */
export function createNostrGitProvider(options: NostrGitFactoryOptions): NostrGitProvider {
  const {
    eventIO,
    signer,
    defaultRelays = DEFAULT_RELAYS.default,
    fallbackRelays = DEFAULT_RELAYS.fallback,
    graspRelays = DEFAULT_RELAYS.grasp,
    enableGrasp = true,
    publishRepoState = true,
    publishRepoAnnouncements = false,
    corsProxy,
    timeoutMs = 10000
  } = options;

  // Create GRASP API if enabled
  let graspApi;
  if (enableGrasp) {
    const graspConfig: GraspApiConfig = {
      eventIO,
      signer,
      relays: graspRelays,
      timeoutMs
    };
    graspApi = new GraspApi(graspConfig);
  }

  // Create NostrGitProvider configuration
  const config: NostrGitConfig = {
    eventIO,
    signer,
    grasp: graspApi,
    defaultRelays,
    fallbackRelays,
    graspRelays,
    publishRepoState,
    publishRepoAnnouncements,
    httpOverrides: corsProxy ? { corsProxy } : undefined
  };

  return new NostrGitProvider(config);
}

/**
 * Create a NostrGitProvider with environment-based configuration
 * 
 * Reads configuration from environment variables and git config.
 * Mirrors ngit's configuration loading behavior.
 */
export function createNostrGitProviderFromEnv(options: {
  eventIO: EventIO;
  signer: Signer;
}): NostrGitProvider {
  const {
    eventIO,
    signer
  } = options;

  // Read configuration from environment variables
  const defaultRelays = process.env.NOSTR_DEFAULT_RELAYS?.split(';') || DEFAULT_RELAYS.default;
  const fallbackRelays = process.env.NOSTR_FALLBACK_RELAYS?.split(';') || DEFAULT_RELAYS.fallback;
  const graspRelays = process.env.NOSTR_GRASP_RELAYS?.split(';') || DEFAULT_RELAYS.grasp;
  const enableGrasp = process.env.NOSTR_ENABLE_GRASP !== 'false';
  const publishRepoState = process.env.NOSTR_PUBLISH_REPO_STATE !== 'false';
  const publishRepoAnnouncements = process.env.NOSTR_PUBLISH_REPO_ANNOUNCEMENTS === 'true';
  const corsProxy = process.env.GIT_DEFAULT_CORS_PROXY === 'none' ? undefined :
                   process.env.GIT_DEFAULT_CORS_PROXY || 'https://cors.isomorphic-git.org';

  return createNostrGitProvider({
    eventIO,
    signer,
    defaultRelays,
    fallbackRelays,
    graspRelays,
    enableGrasp,
    publishRepoState,
    publishRepoAnnouncements,
    corsProxy
  });
}

/**
 * Create a NostrGitProvider with git config integration
 * 
 * Reads configuration from git config settings.
 * Based on ngit's git config integration.
 */
export async function createNostrGitProviderFromGitConfig(options: {
  eventIO: EventIO;
  signer: Signer;
  gitDir?: string;
}): Promise<NostrGitProvider> {
  const {
    eventIO,
    signer,
    gitDir
  } = options;

  // Default configuration
  let config = {
    defaultRelays: DEFAULT_RELAYS.default,
    fallbackRelays: DEFAULT_RELAYS.fallback,
    graspRelays: DEFAULT_RELAYS.grasp,
    enableGrasp: true,
    publishRepoState: true,
    publishRepoAnnouncements: false,
    corsProxy: 'https://cors.isomorphic-git.org'
  };

  // Try to read from git config if available
  try {
    // Note: In a real implementation, this would use git config commands
    // For now, we'll use environment variables as fallback
    const gitConfigRelays = process.env.GIT_CONFIG_NOSTR_RELAYS?.split(';');
    if (gitConfigRelays && gitConfigRelays.length > 0) {
      config.defaultRelays = gitConfigRelays;
    }

    const gitConfigGrasp = process.env.GIT_CONFIG_NOSTR_GRASP;
    if (gitConfigGrasp !== undefined) {
      config.enableGrasp = gitConfigGrasp === 'true';
    }

    const gitConfigPublishState = process.env.GIT_CONFIG_NOSTR_PUBLISH_STATE;
    if (gitConfigPublishState !== undefined) {
      config.publishRepoState = gitConfigPublishState === 'true';
    }
  } catch (error) {
    console.warn('Failed to read git config, using defaults:', error);
  }

  return createNostrGitProvider({
    eventIO,
    signer,
    ...config
  });
}

/**
 * Provider selection logic
 * 
 * Determines which provider to use based on repository URL and configuration.
 * Supports both traditional Git providers and Nostr-based providers.
 */
export function selectProvider(
  url: string,
  options: {
    preferNostr?: boolean;
    enableGrasp?: boolean;
  } = {}
): 'nostr' | 'traditional' {
  const { preferNostr = false, enableGrasp = true } = options;

  // Check if URL is a nostr:// URL
  if (url.startsWith('nostr://')) {
    return 'nostr';
  }

  // Check if URL contains GRASP indicators
  if (enableGrasp && (
    url.includes('relay.ngit.dev') ||
    url.includes('gitnostr.com') ||
    url.includes('grasp')
  )) {
    return 'nostr';
  }

  // Use preference or default to traditional
  return preferNostr ? 'nostr' : 'traditional';
}

/**
 * Create provider based on URL analysis
 * 
 * Automatically selects and creates the appropriate provider
 * based on the repository URL.
 */
export function createProviderForUrl(
  url: string,
  options: {
    eventIO: EventIO;
    signer: Signer;
    preferNostr?: boolean;
    enableGrasp?: boolean;
  }
): NostrGitProvider | null {
  const providerType = selectProvider(url, {
    preferNostr: options.preferNostr,
    enableGrasp: options.enableGrasp
  });

  if (providerType === 'nostr') {
    return createNostrGitProvider({
      eventIO: options.eventIO,
      signer: options.signer,
      enableGrasp: options.enableGrasp ?? true
    });
  }

  return null;
}