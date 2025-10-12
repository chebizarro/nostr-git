import { type Event as NostrEvent } from "nostr-tools";
import { getGitServiceApi, canonicalRepoKey, createEventIO } from "@nostr-git/core";
import { toast } from "./stores/toast.js";
import { tokens as tokensStore, type Token } from "./stores/tokens.js";
import {
  createRepoAnnouncementEvent as createAnnouncementEventShared,
  createRepoStateEvent as createStateEventShared,
  type EventIO,
} from "@nostr-git/shared-types";

// Clean event publishing - no more signer passing anti-pattern!
// All signing is now handled internally by EventIO closures.

/**
 * Normalize GRASP URLs to ensure proper protocol handling.
 * Converts any input to both wsOrigin and httpOrigin with proper security.
 */
function normalizeGraspOrigins(input: string): { wsOrigin: string; httpOrigin: string } {
  try {
    // Parse the input URL
    const url = new URL(input);
    const host = url.host;
    
    // Determine if we're in a secure context (https page)
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
    
    // Build origins with proper protocols
    const wsOrigin = isSecureContext ? `wss://${host}` : `ws://${host}`;
    const httpOrigin = isSecureContext ? `https://${host}` : `http://${host}`;
    
    return { wsOrigin, httpOrigin };
  } catch (error) {
    // Fallback for malformed URLs - try to extract host with regex
    const hostMatch = input.match(/(?:ws|wss|http|https):\/\/([^\/]+)/);
    if (hostMatch) {
      const host = hostMatch[1];
      const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
      const wsOrigin = isSecureContext ? `wss://${host}` : `ws://${host}`;
      const httpOrigin = isSecureContext ? `https://${host}` : `http://${host}`;
      return { wsOrigin, httpOrigin };
    }
    
    // Last resort - assume it's a hostname
    const host = input.replace(/^\/\//, '');
    const isSecureContext = typeof window !== 'undefined' && window.isSecureContext;
    const wsOrigin = isSecureContext ? `wss://${host}` : `ws://${host}`;
    const httpOrigin = isSecureContext ? `https://${host}` : `http://${host}`;
    return { wsOrigin, httpOrigin };
  }
}

/**
 * Check if a repository name is available on GitHub
 * @param repoName - The repository name to check
 * @param token - GitHub authentication token
 * @returns Promise with availability status and reason if unavailable
 */
export async function checkGitHubRepoAvailability(
  repoName: string,
  token: string
): Promise<{
  available: boolean;
  reason?: string;
  username?: string;
}> {
  try {
    // Use GitServiceApi abstraction instead of hardcoded GitHub API calls
    const api = getGitServiceApi("github", token);

    // Get the authenticated user's information
    const currentUser = await api.getCurrentUser();
    const username = currentUser.login;

    // Check if repository already exists by trying to fetch it
    try {
      await api.getRepo(username, repoName);
      // Repository exists
      return {
        available: false,
        reason: "Repository name already exists in your account",
        username,
      };
    } catch (error: any) {
      // Repository doesn't exist (good!) - API throws error for 404
      if (error.message?.includes("404") || error.message?.includes("Not Found")) {
        return { available: true, username };
      }
      // Some other error occurred
      throw error;
    }
  } catch (error) {
    console.error("Error checking repo availability:", error);
    return { 
      available: false, 
      reason: `Failed to check availability: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check repository name availability for a single selected provider
 * @param provider - one of 'github' | 'gitlab' | 'gitea' | 'bitbucket' | 'grasp'
 * @param repoName - repository name to check
 * @param tokens - user tokens
 * @param relayUrl - optional relay URL for GRASP (not used for availability, informational only)
 */
export async function checkProviderRepoAvailability(
  provider: string,
  repoName: string,
  tokens: Token[],
  relayUrl?: string
): Promise<{
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
  // Special-case GRASP: there is no conventional org/user namespace availability to check.
  if (provider === "grasp") {
    return {
      results: [
        {
          provider,
          host: relayUrl || "nostr-relay",
          available: true,
          reason: "Availability not enforced for GRASP relays",
        },
      ],
      hasConflicts: false,
      availableProviders: ["grasp"],
      conflictProviders: [],
    };
  }

  // Map provider to token host matching strategy (aligns with ProviderSelectionStep)
  const hostMatchers: Record<string, (host: string) => boolean> = {
    github: (h) => h === "github.com",
    gitlab: (h) => h === "gitlab.com" || h.endsWith(".gitlab.com"),
    gitea: (h) => h.includes("gitea"),
    bitbucket: (h) => h === "bitbucket.org",
  };

  const match = hostMatchers[provider as keyof typeof hostMatchers];
  const tokenEntry = tokens.find((t) => match?.(t.host));

  if (!tokenEntry) {
    // No token: we cannot query provider API, treat as unknown but do not block
    return {
      results: [
        {
          provider,
          host: "unknown",
          available: true,
          reason: "No token configured; unable to check. Assuming available.",
        },
      ],
      hasConflicts: false,
      availableProviders: [provider],
      conflictProviders: [],
    };
  }

  try {
    const api = getGitServiceApi(provider as any, tokenEntry.token);
    const currentUser = await api.getCurrentUser();
    const username = (currentUser as any).login || (currentUser as any).username || "me";

    try {
      await api.getRepo(username, repoName);
      // Exists → conflict
      return {
        results: [
          {
            provider,
            host: tokenEntry.host,
            available: false,
            reason: `Repository name already exists in your ${provider} account`,
            username,
          },
        ],
        hasConflicts: true,
        availableProviders: [],
        conflictProviders: [provider],
      };
    } catch (error: any) {
      if (error?.message?.includes("404") || error?.message?.includes("Not Found")) {
        return {
          results: [
            {
              provider,
              host: tokenEntry.host,
              available: true,
              username,
            },
          ],
          hasConflicts: false,
          availableProviders: [provider],
          conflictProviders: [],
        };
      }
      // Unknown error: return soft-OK to avoid blocking
      return {
        results: [
          {
            provider,
            host: tokenEntry.host,
            available: true,
            error: String(error?.message || error),
            username,
          },
        ],
        hasConflicts: false,
        availableProviders: [provider],
        conflictProviders: [],
      };
    }
  } catch (e: any) {
    // Network or API error; soft-OK
    return {
      results: [
        {
          provider,
          host: "unknown",
          available: true,
          error: String(e?.message || e),
        },
      ],
      hasConflicts: false,
      availableProviders: [provider],
      conflictProviders: [],
    };
  }
}

/**
 * Check repository name availability across all providers the user has tokens for
 * @param repoName - The repository name to check
 * @param tokens - Array of user tokens
 * @returns Promise with availability results for each provider
 */
export async function checkMultiProviderRepoAvailability(
  repoName: string,
  tokens: Token[]
): Promise<{
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
    github: "github.com",
    gitlab: "gitlab.com",
    gitea: "gitea.com",
    bitbucket: "bitbucket.org",
  };

  const results: Array<{
    provider: string;
    host: string;
    available: boolean;
    reason?: string;
    username?: string;
    error?: string;
  }> = [];
  const availableProviders: string[] = [];
  const conflictProviders: string[] = [];

  // Check availability for each provider the user has tokens for
  for (const token of tokens) {
    // Handle both standard providers and GRASP relays
    let provider;

    if (token.host === "grasp.relay") {
      provider = "grasp";
    } else {
      // Map host to provider name (github.com -> github)
      provider = Object.entries(providerHosts).find(
        ([providerName, host]) => host === token.host
      )?.[0];
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
          username,
        });
        conflictProviders.push(provider);
      } catch (error: any) {
        // Repository doesn't exist (good!)
        if (error.message?.includes("404") || error.message?.includes("Not Found")) {
          results.push({
            provider,
            host: token.host,
            available: true,
            username,
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
        error: error instanceof Error ? error.message : String(error),
      });
      availableProviders.push(provider); // Assume available
    }
  }

  return {
    results,
    hasConflicts: conflictProviders.length > 0,
    availableProviders,
    conflictProviders,
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
  workerApi?: any; // Git worker API instance (optional for backward compatibility)
  workerInstance?: Worker; // Worker instance for event signing (required for GRASP)
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

  let tokens = $state<Token[]>([]);

  // Ensure we only register the GRASP signing event handler once per worker/session
  // Clean event publishing - no more signer passing anti-pattern!

  // Subscribe to token store changes and update reactive state
  tokensStore.subscribe((t) => {
    tokens = t;
    console.log("🔐 Token store updated, now have", t.length, "tokens");
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

  // Resolve the canonical repo key for this creation flow
  async function computeCanonicalKey(config: NewRepoConfig, eventIO?: any): Promise<string> {
    let owner = "";
    if (config.provider === "grasp") {
      // For GRASP, we need the pubkey to create the canonical key
      // Since we're using EventIO, we can get the pubkey from it
      if (eventIO && eventIO.getCurrentPubkey) {
        const pubkey = eventIO.getCurrentPubkey();
        if (pubkey) {
          // Use "owner:name" form which canonicalRepoKey will normalize
          return canonicalRepoKey(`${pubkey}:${config.name}`);
        }
      }
      
      // Fallback: if we can't get the pubkey, use a placeholder
      // This will be resolved later when the actual pubkey is available
      console.warn("Could not get pubkey for GRASP canonical key, using placeholder");
      return canonicalRepoKey(`placeholder:${config.name}`);
    }
    // Standard Git providers: resolve owner via provider API
    // Try to find a token for the selected provider
    let tokens: Token[] = [];
    {
      const unsub = tokensStore.subscribe((v) => (tokens = v));
      unsub();
    }
    const providerHosts: Record<string, string> = {
      github: "github.com",
      gitlab: "gitlab.com",
      gitea: "gitea.com",
      bitbucket: "bitbucket.org",
    };
    const host = providerHosts[config.provider] || config.provider;
    const token = tokens.find((t: Token) => t.host === host)?.token;
    if (!token) throw new Error(`No ${config.provider} token found to resolve owner`);
    const api = getGitServiceApi(config.provider as any, token);
    const currentUser = await api.getCurrentUser();
    owner = currentUser.login;
    return canonicalRepoKey(`${owner}/${config.name}`);
  }

  async function createRepository(config: NewRepoConfig): Promise<NewRepoResult | null> {
    if (isCreating) {
      throw new Error("Repository creation already in progress");
    }

    try {
      isCreating = true;
      error = null;
      progress = [];

      // Precheck: GRASP no longer requires explicit signer passing
      // The EventIO interface handles signing internally via closures
      if (config.provider === "grasp") {
        // No signer check needed - EventIO handles signing internally
        console.log("🔐 GRASP provider selected - EventIO will handle signing internally");
      }

      // Compute canonical key up-front so all subsequent steps use it
      const canonicalKey = await computeCanonicalKey(config);

      // Step 1: Create local repository
      updateProgress("local", "Creating local repository...", "running");
      const localRepo = await createLocalRepo({ ...config }, canonicalKey);
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
        // For GRASP, wait for the relay to process the announcement event
        if (config.provider === "grasp") {
          updateProgress("push", "Waiting for GRASP server to process announcement...", "running");
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
        
        updateProgress("push", "Pushing to remote repository...", "running");
        console.log("🚀 About to push with config:", {
          name: config.name,
          defaultBranch: config.defaultBranch,
          localRepo: localRepo,
        });
        await pushToRemote({ ...config }, remoteRepo, canonicalKey);
        updateProgress("push", "Successfully pushed to remote repository", "completed");
      }

      // Step 4: Create NIP-34 events (use shared-types helpers)
      updateProgress("events", "Creating Nostr events...", "running");
      // Derive clone and web URLs
      const ensureNoGitSuffix = (url: string) => url?.replace(/\.git$/, "");
      const cloneUrl = (() => {
        const raw = remoteRepo?.url || config.cloneUrl || "";
        if (config.provider === "grasp") {
          return raw.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://");
        }
        return raw;
      })();
      const webUrl = ensureNoGitSuffix(remoteRepo?.webUrl || config.webUrl || cloneUrl);

      // Build GRASP relay aliases if applicable
      let relays: string[] | undefined = undefined;
      if (config.provider === "grasp") {
        const normalizeRelayWsOrigin = (u: string) => {
          if (!u) return "";
          try {
            const url = new URL(u);
            const origin = `${url.protocol}//${url.host}`;
            return origin.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
          } catch {
            return u
              .replace(/^http:\/\//, "ws://")
              .replace(/^https:\/\//, "wss://")
              .replace(/(ws[s]?:\/\/[^/]+).*/, "$1");
          }
        };
        const baseRelay = normalizeRelayWsOrigin(config.relayUrl || "");
        const aliases: string[] = [];
        if (baseRelay) aliases.push(baseRelay);
        const viteAliases = (import.meta as any)?.env?.VITE_GRASP_RELAY_ALIASES as
          | string
          | undefined;
        if (viteAliases)
          viteAliases
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((a) => aliases.push(a));
        const nodeAliases = (globalThis as any)?.process?.env?.VITE_GRASP_RELAY_ALIASES as
          | string
          | undefined;
        if (nodeAliases)
          nodeAliases
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((a) => aliases.push(a));
        if (baseRelay) {
          const u = new URL(baseRelay);
          const port = u.port ? `:${u.port}` : "";
          aliases.push(`${u.protocol}//ngit-relay${port}`);
        }
        const seen = new Set<string>();
        relays = aliases.filter((a) => {
          if (seen.has(a)) return false;
          seen.add(a);
          return true;
        });
      }

      const announcementEvent = createAnnouncementEventShared({
        repoId: config.name,
        name: config.name,
        description: config.description || "",
        web: webUrl ? [webUrl] : undefined,
        clone: cloneUrl ? [cloneUrl] : undefined,
        relays,
        maintainers:
          config.maintainers && config.maintainers.length > 0 ? config.maintainers : undefined,
        hashtags: config.tags && config.tags.length > 0 ? config.tags : undefined,
        earliestUniqueCommit: localRepo?.initialCommit || undefined,
      });

      const refs = localRepo?.initialCommit
        ? [
            {
              type: "heads" as const,
              name: config.defaultBranch || "master",
              commit: localRepo.initialCommit,
            },
          ]
        : undefined;
      const stateEvent = createStateEventShared({
        repoId: config.name,
        refs,
        head: config.defaultBranch,
      });
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

  async function createLocalRepo(config: NewRepoConfig, canonicalKey?: string) {
    console.log("🏗️ Starting createLocalRepo function...");
    console.log("🏗️ createLocalRepo canonicalKey:", canonicalKey);
    console.log("🏗️ createLocalRepo config:", config);
    
    // Use passed workerApi if available, otherwise create new worker
    let api: any;
    if (options.workerApi) {
      api = options.workerApi;
    } else {
      const { getGitWorker } = await import("@nostr-git/core");
      const workerInstance = getGitWorker();
      api = workerInstance.api;
    }

    const createLocalRepoParams = {
      repoId: canonicalKey ?? config.name,
      name: config.name,
      description: config.description,
      defaultBranch: config.defaultBranch,
      initializeWithReadme: config.initializeWithReadme,
      gitignoreTemplate: config.gitignoreTemplate,
      licenseTemplate: config.licenseTemplate,
      authorName: config.authorName,
      authorEmail: config.authorEmail,
    };
    console.log("🏗️ createLocalRepo params:", createLocalRepoParams);
    
    const result = await api.createLocalRepo(createLocalRepoParams);
    console.log("🏗️ createLocalRepo result:", result);

    if (!result.success) {
      throw new Error(result.error || "Failed to create local repository");
    }

    return {
      repoId: canonicalKey ?? config.name,
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

      console.log(
        "🚀 Checking availability for:",
        `${username}/${config.name}`,
        "on",
        config.provider
      );

      // Check if repository already exists by trying to fetch it
      try {
        await api.getRepo(username, config.name);
        // Repository exists
        return {
          available: false,
          reason: `Repository name already exists in your ${config.provider} account`,
          username,
        };
      } catch (error: any) {
        // Repository doesn't exist (good!) - API throws error for 404
        if (error.message?.includes("404") || error.message?.includes("Not Found")) {
          return { available: true, username };
        }
        // Some other error occurred
        throw error;
      }
    } catch (error) {
      console.error(`Error checking repo availability on ${config.provider}:`, error);
      return { 
        available: false, 
        reason: `Failed to check availability: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async function createRemoteRepo(config: NewRepoConfig) {
    console.log("🚀 Starting createRemoteRepo function...");
    try {
      // Use passed workerApi if available, otherwise use singleton worker
      let api: any;
      if (options.workerApi) {
        console.log("🚀 Using provided workerApi");
        api = options.workerApi;
      } else {
        console.log("🚀 No workerApi provided, falling back to new worker");
        // Note: Cannot auto-import singleton from library context
        // The app must pass workerApi explicitly
        const { getGitWorker } = await import("@nostr-git/core");
        const workerInstance = getGitWorker();
        api = workerInstance.api;
        console.log("🚀 Created new worker (workerApi not provided)");
      }
      console.log("🚀 Git worker obtained successfully");

      // Get the provider-specific host for token lookup
      const providerHosts: Record<string, string> = {
        github: "github.com",
        gitlab: "gitlab.com",
        gitea: "gitea.com",
        bitbucket: "bitbucket.org",
        grasp: "grasp.relay",
      };

      let providerHost: string | null = null;
      let finalToken: string | null = null;

      if (config.provider === "grasp") {
        // For GRASP, we use EventIO instead of explicit signer passing
        console.log("🔐 Setting up GRASP with EventIO (no more signer passing!)");

        if (!config.relayUrl) {
          throw new Error("GRASP provider requires a relay URL");
        }

        // For GRASP, we'll use a placeholder token for now
        // The actual pubkey will be resolved by EventIO when needed
        finalToken = "grasp-placeholder-token";
        providerHost = config.relayUrl;
      } else {
        // For standard Git providers, use the host mapping
        providerHost = providerHosts[config.provider] || config.provider;

        // Get token for the selected provider from the reactive token store
        console.log("🔐 Current tokens in store:", tokens.length, "tokens");
        console.log(
          "🔐 Token hosts:",
          tokens.map((t) => t.host)
        );
        console.log("🔐 Looking for provider:", config.provider, "with host:", providerHost);

        finalToken = tokens.find((t: Token) => t.host === providerHost)?.token || null;
      }

      console.log(
        "🔐 Provider token found:",
        finalToken
          ? "YES (length: " +
              finalToken.length +
              ", starts: " +
              finalToken.substring(0, 8) +
              ", ends: " +
              finalToken.substring(finalToken.length - 8) +
              ")"
          : "NO"
      );

      if (!finalToken && config.provider !== "grasp") {
        // Try to wait for tokens to load if they're not available yet
        console.log("🔐 No token found for provider, waiting for token store initialization...");
        await tokensStore.waitForInitialization();

        // Refresh tokens after waiting
        await tokensStore.refresh();

        // Try again after waiting and refreshing
        finalToken = tokens.find((t: Token) => t.host === providerHost)?.token || null;

        console.log("🔐 Tokens after refresh:", tokens.length, "tokens");
        console.log(
          "🔐 Provider token found after retry:",
          finalToken ? "YES (length: " + finalToken.length + ")" : "NO"
        );

        if (!finalToken) {
          throw new Error(
            `No ${config.provider} authentication token found. Please add a ${config.provider} token in settings.`
          );
        }
      }

      // Skip availability check for GRASP; providers with tokens are checked
      if (config.provider !== "grasp") {
        console.log("🚀 Checking repository name availability...");
        if (!finalToken) {
          throw new Error("No token available for repository availability check");
        }
        const availability = await checkRepoAvailability(config, finalToken);
        if (!availability.available) {
          throw new Error(availability.reason || "Repository name is not available");
        }
      }

      console.log("🚀 Repository name is available, proceeding with creation...");
      console.log("🚀 Calling createRemoteRepo API with:", {
        provider: config.provider,
        name: config.name,
        description: config.description,
        tokenLength: finalToken ? finalToken.length : "N/A",
        tokenStart: finalToken ? finalToken.substring(0, 8) : "N/A",
        tokenEnd: finalToken ? finalToken.substring(finalToken.length - 8) : "N/A",
      });

      let result;

      if (config.provider === "grasp") {
        console.log("🔐 Setting up GRASP repository creation with EventIO (no more signer passing!)");

        if (!config.relayUrl) throw new Error("GRASP provider requires a relay URL");

        // Normalize GRASP URLs to ensure proper protocol handling
        const { wsOrigin, httpOrigin } = normalizeGraspOrigins(config.relayUrl!);
        console.log("🔐 Normalized GRASP URLs:", { wsOrigin, httpOrigin });

        // Get the Git worker - IMPORTANT: We need to use the same worker instance for both API calls and event signing
        let api: any, worker: Worker;
        if (options.workerApi && options.workerInstance) {
          // Use the passed worker API and instance (already configured with EventIO)
          api = options.workerApi;
          worker = options.workerInstance;
          console.log("🔐 Using provided worker API and instance");
        } else {
          // Fallback: create new worker (won't have EventIO configured)
          console.warn("🔐 No workerApi/workerInstance provided, creating new worker (EventIO may not be configured)");
          const { getGitWorker } = await import("@nostr-git/core");
          const workerInstance = getGitWorker();
          api = workerInstance.api;
          worker = workerInstance.worker;
        }

        // NOTE: No more registerEventSigner needed!
        // The new EventIO interface uses closures instead of passing signers around.
        // The worker will use the EventIO instance passed via configureWorkerEventIO.

        // Now we can use the worker API for GRASP repository creation
        // This maintains our API abstraction and keeps all Git operations in the worker
        result = await api.createRemoteRepo({
          provider: config.provider as any,
          token: finalToken, // This is the pubkey for GRASP
          name: config.name,
          description: config.description || "",
          isPrivate: false,
          baseUrl: wsOrigin, // Use normalized WebSocket origin for GRASP API
        });

        console.log("🔐 GRASP repository created successfully:", result);
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

      console.log("🚀 API call completed, result:", result);

      if (!result.success) {
        console.error("Remote repository creation failed:", result.error);
        throw new Error(`Remote repository creation failed: ${result.error}`);
      }

      console.log("🚀 Remote repository created successfully:", result);
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

  async function pushToRemote(config: NewRepoConfig, remoteRepo: any, canonicalKey?: string) {
    console.log("🚀 Starting pushToRemote function...");
    console.log("🚀 pushToRemote canonicalKey:", canonicalKey);
    console.log("🚀 pushToRemote config:", config);
    
    // Use passed workerApi and workerInstance if available, otherwise create new worker
    let api: any, worker: Worker;
    if (options.workerApi && options.workerInstance) {
      // Use the provided worker API and instance (already configured with EventIO)
      api = options.workerApi;
      worker = options.workerInstance;
      console.log("🔐 Using provided worker API and instance for push");
    } else {
      // Fallback: create new worker (won't have EventIO configured)
      console.warn("🔐 No workerApi/workerInstance provided for push, creating new worker (EventIO may not be configured)");
      const { getGitWorker } = await import("@nostr-git/core");
      const workerInstance = getGitWorker();
      api = workerInstance.api;
      worker = workerInstance.worker;
    }

    // Get the provider-specific host for token lookup
    const providerHosts: Record<string, string> = {
      github: "github.com",
      gitlab: "gitlab.com",
      gitea: "gitea.com",
      bitbucket: "bitbucket.org",
    };

    let providerToken;

    if (config.provider === "grasp") {
      // For GRASP, we use EventIO instead of explicit signer passing
      console.log("🔐 GRASP push - EventIO handles signing internally (no more signer passing!)");
      
      // For GRASP, we'll use a placeholder token for now
      // The actual pubkey will be resolved by EventIO when needed
      providerToken = "grasp-placeholder-token";

      // NOTE: No more registerEventSigner needed!
      // The new EventIO interface uses closures instead of passing signers around.
      // The worker will use the EventIO instance passed via configureWorkerEventIO.
    } else {
      const providerHost = providerHosts[config.provider] || config.provider;
      providerToken = tokens.find((t: Token) => t.host === providerHost)?.token;
    }

    // For GRASP, ensure we use HTTP(S) endpoint for push operations
    let pushUrl: string;
    if (config.provider === "grasp") {
      // Use the URL from the GRASP API which already has the correct npub format
      pushUrl = remoteRepo.remoteUrl;
      console.log("🔐 Using GRASP API URL for push:", { pushUrl });
    } else {
      pushUrl = remoteRepo.url;
    }

    console.log("🚀 Pushing to remote with URL:", pushUrl);
    console.log("🚀 Push config:", {
      provider: config.provider,
      repoPath: canonicalKey ?? config.name,
      defaultBranch: config.defaultBranch,
      remoteUrl: pushUrl,
      tokenLength: providerToken ? providerToken.length : "No token",
    });

    // Push to remote repository
    // Note: For GRASP, we don't pass a signer object since signing is handled via message protocol
    // For GRASP, use direct pushToRemote since we know the repo exists locally
    // For other providers, use safePushToRemote for preflight checks
    console.log("[NEW REPO] Pushing to remote for provider:", config.provider);
    console.log("[NEW REPO] Push params:", {
      repoId: canonicalKey || config.name,
      remoteUrl: pushUrl,
      branch: config.defaultBranch,
      tokenLength: providerToken ? providerToken.length : "No token",
      provider: config.provider,
    });
    
    let pushResult;
    if (config.provider === "grasp") {
      // For GRASP, use direct push since we just created the local repo
      console.log("[NEW REPO] Using direct pushToRemote for GRASP");
      const directPushResult = await api.pushToRemote({
        repoId: canonicalKey || config.name,
        remoteUrl: pushUrl,
        branch: config.defaultBranch,
        token: providerToken,
        provider: config.provider as any,
      });
      pushResult = { success: directPushResult?.success || false, pushed: directPushResult?.success };
    } else {
      // For other providers, use safePushToRemote for preflight checks
      console.log("[NEW REPO] Using safePushToRemote for non-GRASP provider");
      pushResult = await api.safePushToRemote({
        repoId: canonicalKey || config.name,
        remoteUrl: pushUrl,
        branch: config.defaultBranch,
        token: providerToken,
        provider: config.provider as any,
        preflight: {
          blockIfUncommitted: true,
          requireUpToDate: true,
          blockIfShallow: false,
        },
      });
    }
    console.log("[NEW REPO] Push result:", pushResult);

    if (!pushResult?.success) {
      if (pushResult?.requiresConfirmation) {
        throw new Error(pushResult.warning || "Force push requires confirmation.");
      }
      throw new Error(pushResult?.error || "Safe push failed");
    }

    return remoteRepo;
  }

  // Removed local event creator helpers in favor of shared-types implementations

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
