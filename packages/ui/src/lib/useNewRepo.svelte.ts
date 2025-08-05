import { type Event as NostrEvent } from "nostr-tools";
import { tokens as tokensStore, type Token } from "./stores/tokens.js";
import { getGitServiceApi } from '@nostr-git/core';

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

export interface NewRepoConfig {
  name: string;
  description: string;
  initializeWithReadme: boolean;
  gitignoreTemplate: string;
  licenseTemplate: string;
  defaultBranch: string;
  // Author information
  authorName: string;
  authorEmail: string;
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
    const result = await checkGitHubRepoAvailability(config.name, token);
    if (result.username) {
      console.log('🚀 Checking availability for:', `${result.username}/${config.name}`);
    }
    return result;
  }

  async function createRemoteRepo(config: NewRepoConfig) {
    console.log('🚀 Starting createRemoteRepo function...');
    try {
      const { getGitWorker } = await import("@nostr-git/core");
      const { api } = getGitWorker();
      console.log('🚀 Git worker obtained successfully');

      // Get GitHub token from the reactive token store (following established pattern)
      console.log('🔐 Current tokens in store:', tokens.length, 'tokens');
      console.log('🔐 Token hosts:', tokens.map(t => t.host));
      
      let finalToken = tokens.find((t: Token) => t.host === "github.com")?.token;
      
      console.log('🔐 GitHub token found:', finalToken ? 'YES (length: ' + finalToken.length + ', starts: ' + finalToken.substring(0, 8) + ', ends: ' + finalToken.substring(finalToken.length - 8) + ')' : 'NO');

      if (!finalToken) {
        // Try to wait for tokens to load if they're not available yet
        console.log('🔐 No GitHub token found, waiting for token store initialization...');
        await tokensStore.waitForInitialization();
        
        // Refresh tokens after waiting
        await tokensStore.refresh();
        
        // Try again after waiting and refreshing
        finalToken = tokens.find((t: Token) => t.host === "github.com")?.token;
        
        console.log('🔐 Tokens after refresh:', tokens.length, 'tokens');
        console.log('🔐 GitHub token found after retry:', finalToken ? 'YES (length: ' + finalToken.length + ')' : 'NO');
        
        if (!finalToken) {
          throw new Error(
            "No GitHub authentication token found. Please add a GitHub token in settings."
          );
        }
      }

      // Check if repository name is available before attempting to create
      console.log('🚀 Checking repository name availability...');
      const availability = await checkRepoAvailability(config, finalToken);
      
      if (!availability.available) {
        throw new Error(availability.reason || 'Repository name is not available');
      }
      
      console.log('🚀 Repository name is available, proceeding with creation...');
      console.log('🚀 Calling createRemoteRepo API with:', {
        provider: "github",
        name: config.name,
        description: config.description,
        tokenLength: finalToken.length,
        tokenStart: finalToken.substring(0, 8),
        tokenEnd: finalToken.substring(finalToken.length - 8)
      });
      
      const result = await api.createRemoteRepo({
        provider: "github",
        token: finalToken,
        name: config.name,
        description: config.description,
        isPrivate: false, // Default to public for now
      });
      
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
    const { api } = getGitWorker();

    // Get GitHub token for push authentication
    const githubToken = tokens.find((t: Token) => t.host === "github.com")?.token;
    
    console.log('🚀 Pushing to remote with URL:', remoteRepo.url);
    console.log('🚀 Push config:', {
      repoId: config.name,
      remoteUrl: remoteRepo.url,
      branch: config.defaultBranch,
      hasToken: !!githubToken
    });
    
    const result = await api.pushToRemote({
      repoId: config.name,
      remoteUrl: remoteRepo.url,
      branch: config.defaultBranch,
      token: githubToken, // Add token for authentication
    });
    
    console.log('🚀 Push result:', result);

    if (!result.success) {
      throw new Error(result.error || "Failed to push to remote repository");
    }

    return result;
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
    if (config.relays && config.relays.length > 0) {
      config.relays.forEach((relay) => {
        tags.push(["relay", relay]);
      });
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
