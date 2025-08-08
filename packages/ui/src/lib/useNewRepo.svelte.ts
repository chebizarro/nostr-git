import { type Event as NostrEvent } from "nostr-tools";
import { tokens as tokensStore, type Token } from "./stores/tokens.js";
import { getGitServiceApi } from '@nostr-git/core';
import { signer as signerStore } from "./stores/signer";
import type { Signer as NostrGitSigner } from "./stores/signer";

/**
 * Check if a repository name is available on GitHub
 * @param repoName - The repository name to check
 * @param token - GitHub authentication token
 * @returns Promise with availability status and reason if unavailable
 */
export async function checkGitHubRepoAvailability(repoName: string, token: string): Promise<{
  available: boolean;
  reason?: string;
  username?: string;
}> {
  try {
    // Use GitServiceApi abstraction instead of hardcoded GitHub API calls
    const api = getGitServiceApi('github', token);
    
    // Get the authenticated user's information
    const currentUser = await api.getCurrentUser();
    const username = currentUser.login;
    
    // Check if repository already exists by trying to fetch it
    try {
      await api.getRepo(username, repoName);
      // Repository exists
      return { 
        available: false, 
        reason: 'Repository name already exists in your account',
        username 
      };
    } catch (error: any) {
      // Repository doesn't exist (good!) - API throws error for 404
      if (error.message?.includes('404') || error.message?.includes('Not Found')) {
        return { available: true, username };
      }
      // Some other error occurred
      throw error;
    }
  } catch (error) {
    // Network error or other issue - proceed anyway
    console.warn('Error checking repo availability:', error);
    return { available: true };
  }
}

/**
 * Check repository name availability across all providers the user has tokens for
 * @param repoName - The repository name to check
 * @param tokens - Array of user tokens
 * @returns Promise with availability results for each provider
 */
export async function checkMultiProviderRepoAvailability(repoName: string, tokens: Token[]): Promise<{
  results: Array<{
    provider: string;
    host: string;
    available: boolean;
    reason?: string;
    username?: string;
    error?: string;
  }>;
  hasConflicts: boolean;
  availableProviders: string[];
  conflictProviders: string[];
}> {
  // Map between provider names and their API hosts
  const providerHosts: Record<string, string> = {
    'github': 'github.com',
    'gitlab': 'gitlab.com',
    'gitea': 'gitea.com',
    'bitbucket': 'bitbucket.org'
  };

  const results = [];
  const availableProviders = [];
  const conflictProviders = [];

  // Check availability for each provider the user has tokens for
  for (const token of tokens) {
    // Handle both standard providers and GRASP relays
    let provider;
    
    if (token.host === 'grasp.relay') {
      provider = 'grasp';
    } else {
      // Map host to provider name (github.com -> github)
      provider = Object.entries(providerHosts).find(([providerName, host]) => host === token.host)?.[0];
    }
    
    if (!provider) {
      console.warn(`Unknown provider for host: ${token.host}`);
      // Skip unknown providers
      continue;
    }

    try {
      const api = getGitServiceApi(provider as any, token.token);
      
      // Get the authenticated user's information
      const currentUser = await api.getCurrentUser();
      const username = currentUser.login;
      
      // Check if repository already exists
      try {
        await api.getRepo(username, repoName);
        // Repository exists - conflict
        results.push({
          provider,
          host: token.host,
          available: false,
          reason: `Repository name already exists in your ${provider} account`,
          username
        });
        conflictProviders.push(provider);
      } catch (error: any) {
        // Repository doesn't exist (good!)
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          results.push({
            provider,
            host: token.host,
            available: true,
            username
          });
          availableProviders.push(provider);
        } else {
          // Some other error occurred
          throw error;
        }
      }
    } catch (error) {
      // Network error or API issue
      console.warn(`Error checking repo availability on ${provider}:`, error);
      results.push({
        provider,
        host: token.host,
        available: true, // Assume available if we can't check
        error: error instanceof Error ? error.message : String(error)
      });
      availableProviders.push(provider); // Assume available
    }
  }

  return {
    results,
    hasConflicts: conflictProviders.length > 0,
    availableProviders,
    conflictProviders
  };
}

export interface NewRepoConfig {
  name: string;
  description?: string;
  defaultBranch: string;
  initializeWithReadme?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
  authorName?: string;
  authorEmail?: string;
  provider: string; // Git provider (github, gitlab, gitea, etc.)
  relayUrl?: string; // For GRASP provider
  // Author information
  // NIP-34 metadata
  maintainers?: string[]; // Additional maintainer pubkeys
  relays?: string[]; // Preferred relays for this repo
  tags?: string[]; // Repository tags/topics
  webUrl?: string; // Web browsing URL
  cloneUrl?: string; // Git clone URL
}

export interface NewRepoResult {
  localRepo: {
    repoId: string;
    path: string;
    branch: string;
    initialCommit: string;
  };
  remoteRepo?: {
    url: string;
    provider: string;
    webUrl: string;
  };
  announcementEvent: Omit<NostrEvent, "id" | "sig" | "pubkey" | "created_at">;
  stateEvent: Omit<NostrEvent, "id" | "sig" | "pubkey" | "created_at">;
}

export interface NewRepoProgress {
  step: string;
  message: string;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
}

export interface UseNewRepoOptions {
  onProgress?: (progress: NewRepoProgress[]) => void;
  onRepoCreated?: (result: NewRepoResult) => void;
  onPublishEvent?: (
    event: Omit<NostrEvent, "id" | "sig" | "pubkey" | "created_at">
  ) => Promise<void>;
}

/**
 * Svelte hook for creating new repositories with NIP-34 integration
 *
 * @example
 * ```typescript
 * const { createRepository, isCreating, progress, error } = useNewRepo({
 *   onProgress: (steps) => console.log('Progress:', steps),
 *   onRepoCreated: (result) => console.log('Created:', result),
 *   onPublishEvent: async (event) => await publishToRelay(event)
 * });
 *
 * // Create a new repository
 * await createRepository({
 *   name: 'my-project',
 *   description: 'A cool project',
 *   initializeWithReadme: true,
 *   gitignoreTemplate: 'node',
 *   licenseTemplate: 'mit',
 *   defaultBranch: 'main'
 * });
 * ```
 */
export function useNewRepo(options: UseNewRepoOptions = {}) {
  let isCreating = $state(false);
  let progress = $state<NewRepoProgress[]>([]);
  let error = $state<string | null>(null);

  let tokens = $state([]);

  // Subscribe to token store changes and update reactive state
  tokensStore.subscribe((t) => {
    tokens = t;
    console.log('🔐 Token store updated, now have', t.length, 'tokens');
  });

  const { onProgress, onRepoCreated, onPublishEvent } = options;

  function updateProgress(
    step: string,
    message: string,
    status: NewRepoProgress["status"],
    errorMsg?: string
  ) {
    const stepIndex = progress.findIndex((p) => p.step === step);
    const newStep: NewRepoProgress = { step, message, status, error: errorMsg };

    if (stepIndex >= 0) {
      progress[stepIndex] = newStep;
    } else {
      progress = [...progress, newStep];
    }

    onProgress?.(progress);
  }

  async function createRepository(config: NewRepoConfig): Promise<NewRepoResult | null> {
    if (isCreating) {
      throw new Error("Repository creation already in progress");
    }

    try {
      isCreating = true;
      error = null;
      progress = [];

      // Step 1: Create local repository
      updateProgress("local", "Creating local repository...", "running");
      const localRepo = await createLocalRepo(config);
      updateProgress("local", "Local repository created successfully", "completed");

      // Step 2: Create remote repository (optional)
      updateProgress("remote", "Creating remote repository...", "running");
      const remoteRepo = await createRemoteRepo(config);
      if (remoteRepo) {
        updateProgress("remote", "Remote repository created successfully", "completed");
      } else {
        updateProgress("remote", "Skipped remote repository creation", "completed");
      }

      // Step 3: Push to remote (if remote exists)
      if (remoteRepo) {
        updateProgress("push", "Pushing to remote repository...", "running");
        console.log('🚀 About to push with config:', {
          name: config.name,
          defaultBranch: config.defaultBranch,
          localRepo: localRepo
        });
        await pushToRemote(config, remoteRepo);
        updateProgress("push", "Successfully pushed to remote repository", "completed");
      }

      // Step 4: Create NIP-34 events
      updateProgress("events", "Creating Nostr events...", "running");
      const announcementEvent = createRepoAnnouncementEvent(config, localRepo, remoteRepo);
      const stateEvent = createRepoStateEvent(config, localRepo, remoteRepo);
      updateProgress("events", "Nostr events created successfully", "completed");

      // Step 5: Publish events (if handler provided)
      if (onPublishEvent) {
        updateProgress("publish", "Publishing to Nostr relays...", "running");
        await onPublishEvent(announcementEvent);
        await onPublishEvent(stateEvent);
        updateProgress("publish", "Successfully published to Nostr relays", "completed");
      }

      const result: NewRepoResult = {
        localRepo,
        remoteRepo,
        announcementEvent,
        stateEvent,
      };

      onRepoCreated?.(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      error = errorMessage;

      // Update the current step to error status
      const currentStep = progress.find((p) => p.status === "running");
      if (currentStep) {
        updateProgress(currentStep.step, `Failed: ${errorMessage}`, "error", errorMessage);
      }

      console.error("Repository creation failed:", err);
      return null;
    } finally {
      isCreating = false;
    }
  }

  async function createLocalRepo(config: NewRepoConfig) {
    const { getGitWorker } = await import("@nostr-git/core");
    const { api } = getGitWorker();

    const result = await api.createLocalRepo({
      repoId: config.name,
      name: config.name,
      description: config.description,
      defaultBranch: config.defaultBranch,
      initializeWithReadme: config.initializeWithReadme,
      gitignoreTemplate: config.gitignoreTemplate,
      licenseTemplate: config.licenseTemplate,
      authorName: config.authorName,
      authorEmail: config.authorEmail,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to create local repository");
    }

    return {
      repoId: config.name,
      path: result.repoPath,
      branch: config.defaultBranch,
      initialCommit: result.initialCommit,
    };
  }

  async function checkRepoAvailability(config: NewRepoConfig, token: string) {
    try {
      // Use GitServiceApi abstraction instead of hardcoded GitHub API calls
      const api = getGitServiceApi(config.provider as any, token);
      
      // Get the authenticated user's information
      const currentUser = await api.getCurrentUser();
      const username = currentUser.login;
      
      console.log('🚀 Checking availability for:', `${username}/${config.name}`, 'on', config.provider);
      
      // Check if repository already exists by trying to fetch it
      try {
        await api.getRepo(username, config.name);
        // Repository exists
        return { 
          available: false, 
          reason: `Repository name already exists in your ${config.provider} account`,
          username 
        };
      } catch (error: any) {
        // Repository doesn't exist (good!) - API throws error for 404
        if (error.message?.includes('404') || error.message?.includes('Not Found')) {
          return { available: true, username };
        }
        // Some other error occurred
        throw error;
      }
    } catch (error) {
      // Network error or other issue - proceed anyway
      console.warn(`Error checking repo availability on ${config.provider}:`, error);
      return { available: true };
    }
  }

  async function createRemoteRepo(config: NewRepoConfig) {
    console.log('🚀 Starting createRemoteRepo function...');
    try {
      const { getGitWorker } = await import("@nostr-git/core");
      const { api } = getGitWorker();
      console.log('🚀 Git worker obtained successfully');

      // Get the provider-specific host for token lookup
      const providerHosts: Record<string, string> = {
        'github': 'github.com',
        'gitlab': 'gitlab.com',
        'gitea': 'gitea.com',
        'bitbucket': 'bitbucket.org',
        'grasp': 'grasp.relay'
      };
      
      let providerHost;
      let finalToken;
      let nostrSigner: NostrGitSigner | null = null;

      if (config.provider === 'grasp') {
        // For GRASP, we need to use the Nostr signer instead of a token
        console.log('🔐 Setting up GRASP with Nostr signer');
        
        // Get the signer from the store
        signerStore.subscribe(value => {
          nostrSigner = value;
        })();
        
        if (!nostrSigner) {
          throw new Error('No Nostr signer available for GRASP provider');
        }
        
        if (!config.relayUrl) {
          throw new Error('GRASP provider requires a relay URL');
        }
        
        // For GRASP, the token is actually the pubkey
        const pubkey = await nostrSigner.getPubkey();
        finalToken = pubkey;
        providerHost = config.relayUrl;
      } else {
        // For standard Git providers, use the host mapping
        providerHost = providerHosts[config.provider] || config.provider;
        
        // Get token for the selected provider from the reactive token store
        console.log('🔐 Current tokens in store:', tokens.length, 'tokens');
        console.log('🔐 Token hosts:', tokens.map(t => t.host));
        console.log('🔐 Looking for provider:', config.provider, 'with host:', providerHost);
        
        finalToken = tokens.find((t: Token) => t.host === providerHost)?.token;
      }
      
      console.log('🔐 Provider token found:', finalToken ? 'YES (length: ' + finalToken.length + ', starts: ' + finalToken.substring(0, 8) + ', ends: ' + finalToken.substring(finalToken.length - 8) + ')' : 'NO');

      if (!finalToken && config.provider !== 'grasp') {
        // Try to wait for tokens to load if they're not available yet
        console.log('🔐 No token found for provider, waiting for token store initialization...');
        await tokensStore.waitForInitialization();
        
        // Refresh tokens after waiting
        await tokensStore.refresh();
        
        // Try again after waiting and refreshing
        finalToken = tokens.find((t: Token) => t.host === providerHost)?.token;
        
        console.log('🔐 Tokens after refresh:', tokens.length, 'tokens');
        console.log('🔐 Provider token found after retry:', finalToken ? 'YES (length: ' + finalToken.length + ')' : 'NO');
        
        if (!finalToken) {
          throw new Error(
            `No ${config.provider} authentication token found. Please add a ${config.provider} token in settings.`
          );
        }
      }
      
      console.log('🚀 Checking repository name availability...');
      const availability = await checkRepoAvailability(config, finalToken);
      
      if (!availability.available) {
        throw new Error(availability.reason || 'Repository name is not available');
      }
      
      console.log('🚀 Repository name is available, proceeding with creation...');
      console.log('🚀 Calling createRemoteRepo API with:', {
        provider: config.provider,
        name: config.name,
        description: config.description,
        tokenLength: finalToken ? finalToken.length : 'N/A',
        tokenStart: finalToken ? finalToken.substring(0, 8) : 'N/A',
        tokenEnd: finalToken ? finalToken.substring(finalToken.length - 8) : 'N/A'
      });
      
      let result;
      
      if (config.provider === 'grasp') {
        console.log('🔐 Setting up GRASP repository creation with message-based signing');
        
        if (!nostrSigner) throw new Error('No Nostr signer available');
        if (!config.relayUrl) throw new Error('GRASP provider requires a relay URL');
        
        // Get the Git worker - IMPORTANT: We need to use the same worker instance for both API calls and event signing
        const { getGitWorker } = await import("@nostr-git/core");
        const { api, worker } = getGitWorker(); // Get both API and worker from the same call
        
        // Register the event signing function with the worker
        // This enables the message-based signing protocol
        // We need to use a proxy approach since functions can't be cloned across worker boundaries
        console.log('🔐 Setting up event signer proxy for worker');
        
        // We'll set up a message handler directly instead of using a separate function
        
        try {
          // Set up a message handler for event signing requests
          console.log('🔐 Setting up event signing message handler');
          
          // Set up a message handler for event signing requests
          worker.addEventListener('message', async (event) => {
            if (event.data.type === 'request-event-signing') {
              try {
                console.log('🔐 Received event signing request:', event.data);
                const signedEvent = await nostrSigner.sign(event.data.event);
                console.log('🔐 Event signed successfully');
                
                // Send the signed event back to the worker
                worker.postMessage({
                  type: 'event-signed',
                  requestId: event.data.requestId,
                  signedEvent
                });
              } catch (error) {
                console.error('🔐 Error signing event:', error);
                
                // Send the error back to the worker
                worker.postMessage({
                  type: 'event-signing-error',
                  requestId: event.data.requestId,
                  error: error instanceof Error ? error.message : String(error)
                });
              }
            }
          });
          
          // Tell the worker that event signing is available
          worker.postMessage({ type: 'register-event-signer' });
          
          console.log('🔐 Event signing setup complete');
        } catch (error) {
          console.error('🔐 Error setting up event signing:', error);
          throw new Error('Failed to set up event signing: ' + (error instanceof Error ? error.message : String(error)));
        }
        
        // Now we can use the worker API for GRASP repository creation
        // This maintains our API abstraction and keeps all Git operations in the worker
        result = await api.createRemoteRepo({
          provider: config.provider as any,
          token: finalToken, // This is the pubkey for GRASP
          name: config.name,
          description: config.description || '',
          isPrivate: false,
          baseUrl: config.relayUrl // Pass the relay URL
        });
        
        console.log('🔐 GRASP repository created successfully:', result);
      } else {
        // Standard Git providers
        result = await api.createRemoteRepo({
          provider: config.provider as any,
          token: finalToken,
          name: config.name,
          description: config.description,
          isPrivate: false, // Default to public for now
        });
      }
      
      console.log('🚀 API call completed, result:', result);

      if (!result.success) {
        console.error("Remote repository creation failed:", result.error);
        throw new Error(`Remote repository creation failed: ${result.error}`);
      }
      
      console.log('🚀 Remote repository created successfully:', result);
      return {
        url: result.remoteUrl, // Use remoteUrl from the API response
        provider: result.provider,
        webUrl: result.webUrl || result.remoteUrl, // Fallback to remoteUrl if webUrl not provided
      };
    } catch (error) {
      console.error("Remote repository creation failed with exception:", error);
      throw error; // Don't silently continue - let the error bubble up
    }
  }

  async function pushToRemote(config: NewRepoConfig, remoteRepo: any) {
    console.log('🚀 Starting pushToRemote function...');
    const { getGitWorker } = await import("@nostr-git/core");
    const { api, worker } = getGitWorker();

    // Get the provider-specific host for token lookup
    const providerHosts: Record<string, string> = {
      'github': 'github.com',
      'gitlab': 'gitlab.com',
      'gitea': 'gitea.com',
      'bitbucket': 'bitbucket.org'
    }; 
    
    let providerToken;
    let nostrSigner: NostrGitSigner | null = null;

    if (config.provider === 'grasp') {
      // For GRASP, we need the Nostr signer
      signerStore.subscribe(value => {
        nostrSigner = value;
      })();
      
      if (!nostrSigner) {
        throw new Error('No Nostr signer available for GRASP provider');
      }
      
      // For GRASP, we use the pubkey as the token
      providerToken = await nostrSigner.getPubkey();
      
      // Set up message-based signing for GRASP
      console.log('🔐 Setting up event signing message handler for GRASP push');
      
      // Set up a message handler for event signing requests
      worker.addEventListener('message', async (event) => {
        if (event.data.type === 'request-event-signing') {
          try {
            console.log('🔐 Received event signing request for push:', event.data);
            const signedEvent = await nostrSigner!.sign(event.data.event);
            console.log('🔐 Event signed successfully for push');
            
            // Send the signed event back to the worker
            worker.postMessage({
              type: 'event-signed',
              requestId: event.data.requestId,
              signedEvent
            });
          } catch (error) {
            console.error('🔐 Error signing event for push:', error);
            
            // Send the error back to the worker
            worker.postMessage({
              type: 'event-signing-error',
              requestId: event.data.requestId,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      });
      
      // Tell the worker that event signing is available
      worker.postMessage({ type: 'register-event-signer' });
      
      console.log('🔐 Event signing setup complete for GRASP push');
    } else {
      const providerHost = providerHosts[config.provider] || config.provider;
      providerToken = tokens.find((t: Token) => t.host === providerHost)?.token;
    }
    
    console.log('🚀 Pushing to remote with URL:', remoteRepo.url);
    console.log('🚀 Push config:', {
      provider: config.provider,
      repoPath: config.name,
      defaultBranch: config.defaultBranch,
      remoteUrl: remoteRepo.url,
      tokenLength: providerToken ? providerToken.length : 'No token'
    });

    // Push to remote repository
    // Note: For GRASP, we don't pass a signer object since signing is handled via message protocol
    await api.pushToRemote({
      repoId: config.name,
      remoteUrl: remoteRepo.url,
      branch: config.defaultBranch,
      token: providerToken,
      provider: config.provider
    });

    return remoteRepo;
  }

  function createRepoAnnouncementEvent(
    config: NewRepoConfig,
    localRepo: any,
    remoteRepo?: any
  ): Omit<NostrEvent, "id" | "sig" | "pubkey" | "created_at"> {
    const cloneUrls = [];
    const webUrls = [];

    // Add remote URLs if available
    if (remoteRepo?.url) cloneUrls.push(remoteRepo.url);
    if (remoteRepo?.webUrl) webUrls.push(remoteRepo.webUrl);

    // Add user-provided URLs
    if (config.cloneUrl) cloneUrls.push(config.cloneUrl);
    if (config.webUrl) webUrls.push(config.webUrl);

    // Ensure all required values are defined
    const repoId = localRepo?.repoId || config.name || "unknown-repo";
    const name = config.name || "Untitled Repository";
    const description = config.description || "";
    const initialCommit = localRepo?.initialCommit || "";

    const tags = [
      ["d", repoId],
      ["name", name],
      ["description", description],
    ];

    // Only add commit reference if we have a valid commit
    if (initialCommit) {
      tags.push(["r", initialCommit, "euc"]);
    }

    // Add clone URLs
    if (cloneUrls.length > 0) {
      tags.push(["clone", ...cloneUrls]);
    }

    // Add web URLs
    if (webUrls.length > 0) {
      tags.push(["web", ...webUrls]);
    }

    // Add maintainers (additional to the author)
    if (config.maintainers && config.maintainers.length > 0) {
      config.maintainers.forEach((maintainer) => {
        tags.push(["maintainer", maintainer]);
      });
    }

    // Add relays
    const relaysToAdd = [...(config.relays || [])];
    // For GRASP providers, ensure the relay URL is included
    if (config.provider === 'grasp' && config.relayUrl && !relaysToAdd.includes(config.relayUrl)) {
      relaysToAdd.push(config.relayUrl);
    }
    
    if (relaysToAdd.length > 0) {
      relaysToAdd.forEach((relay) => {
        tags.push(["relay", relay]);
      });
    }

    // For GRASP providers, also add the relay URL to clone tags
    if (config.provider === 'grasp' && config.relayUrl) {
      // Add to existing clone URLs or create new clone tag
      const cloneTagIndex = tags.findIndex(tag => tag[0] === 'clone');
      if (cloneTagIndex !== -1) {
        // Add to existing clone tag if not already present
        if (!tags[cloneTagIndex].includes(config.relayUrl)) {
          tags[cloneTagIndex].push(config.relayUrl);
        }
      } else {
        // Create new clone tag with the relay URL
        tags.push(["clone", config.relayUrl]);
      }
    }

    // Add tags/topics
    if (config.tags && config.tags.length > 0) {
      config.tags.forEach((tag) => {
        tags.push(["t", tag]);
      });
    }

    return {
      kind: 30617,
      content: config.description || "",
      tags,
    };
  }

  function createRepoStateEvent(
    config: NewRepoConfig,
    localRepo: any,
    remoteRepo?: any
  ): Omit<NostrEvent, "id" | "sig" | "pubkey" | "created_at"> {
    // Ensure all required values are defined
    const repoId = localRepo?.repoId || config.name || "unknown-repo";
    const defaultBranch = config.defaultBranch || "master";
    const initialCommit = localRepo?.initialCommit || "";

    const tags = [["d", repoId]];

    // Only add branch references if we have a valid commit
    if (initialCommit) {
      tags.push(["HEAD", `refs/heads/${defaultBranch}`, initialCommit]);
      tags.push([`refs/heads/${defaultBranch}`, initialCommit]);
    }

    return {
      kind: 30618,
      content: "",
      tags,
    };
  }

  function reset() {
    isCreating = false;
    progress = [];
    error = null;
  }

  function retry() {
    // Reset error state and allow retry
    error = null;
    progress = progress.map((p) =>
      p.status === "error" ? { ...p, status: "pending" as const } : p
    );
  }

  return {
    // State
    isCreating: () => isCreating,
    progress: () => progress,
    error: () => error,

    // Actions
    createRepository,
    reset,
    retry,
  };
}
