import { type Event as NostrEvent } from "nostr-tools";
import { tokens as tokensStore, type Token } from "./stores/tokens.js";
import { getGitServiceApi, canonicalRepoKey } from "@nostr-git/core";
import { signer as signerStore } from "./stores/signer";
import { toast } from "./stores/toast.js";
import type { Signer as NostrGitSigner } from "./stores/signer";
import {
  createRepoAnnouncementEvent as createAnnouncementEventShared,
  createRepoStateEvent as createStateEventShared,
} from "@nostr-git/shared-types";

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
    // Network error or other issue - proceed anyway
    console.warn("Error checking repo availability:", error);
    return { available: true };
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
  let signingSetupDone = false;

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
  async function computeCanonicalKey(config: NewRepoConfig): Promise<string> {
    let owner = "";
    if (config.provider === "grasp") {
      let signer: NostrGitSigner | null = null;
      signerStore.subscribe((v) => (signer = v))();
      if (!signer) {
        // Retry once on next tick in case store hasn't hydrated yet
        await Promise.resolve();
        signerStore.subscribe((v) => (signer = v))();
      }
      if (!signer) {
        throw new Error("No Nostr signer available for GRASP provider");
      }
      const pubkey = await (signer as NostrGitSigner).getPubkey();
      // Use "owner:name" form which canonicalRepoKey will normalize
      return canonicalRepoKey(`${pubkey}:${config.name}`);
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

      // Precheck: GRASP requires a Nostr signer
      if (config.provider === "grasp") {
        let signer: NostrGitSigner | null = null;
        signerStore.subscribe((v) => (signer = v))();
        if (!signer) {
          updateProgress(
            "precheck",
            "Missing Nostr signer for GRASP provider",
            "error",
            "No Nostr signer is connected. Please connect a signer in Settings and try again."
          );
          toast.push({
            message: "GRASP requires a connected Nostr signer. Connect one in Settings and try again.",
            variant: "destructive",
          });
          throw new Error("No Nostr signer available for GRASP provider");
        }
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
    const { getGitWorker } = await import("@nostr-git/core");
    const { api } = getGitWorker();

    const result = await api.createLocalRepo({
      repoId: canonicalKey ?? config.name,
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
      // Network error or other issue - proceed anyway
      console.warn(`Error checking repo availability on ${config.provider}:`, error);
      return { available: true };
    }
  }

  async function createRemoteRepo(config: NewRepoConfig) {
    console.log("🚀 Starting createRemoteRepo function...");
    try {
      const { getGitWorker } = await import("@nostr-git/core");
      const { api } = getGitWorker();
      console.log("🚀 Git worker obtained successfully");

      // Get the provider-specific host for token lookup
      const providerHosts: Record<string, string> = {
        github: "github.com",
        gitlab: "gitlab.com",
        gitea: "gitea.com",
        bitbucket: "bitbucket.org",
        grasp: "grasp.relay",
      };

      let providerHost;
      let finalToken;
      let nostrSigner: NostrGitSigner | null = null;

      if (config.provider === "grasp") {
        // For GRASP, we need to use the Nostr signer instead of a token
        console.log("🔐 Setting up GRASP with Nostr signer");

        // Get the signer from the store
        signerStore.subscribe((value) => {
          nostrSigner = value;
        })();

        if (!nostrSigner) {
          throw new Error("No Nostr signer available for GRASP provider");
        }

        if (!config.relayUrl) {
          throw new Error("GRASP provider requires a relay URL");
        }

        // For GRASP, the token is actually the pubkey
        const pubkey = await nostrSigner.getPubkey();
        finalToken = pubkey;
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

        finalToken = tokens.find((t: Token) => t.host === providerHost)?.token;
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
        finalToken = tokens.find((t: Token) => t.host === providerHost)?.token;

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
        console.log("🔐 Setting up GRASP repository creation with message-based signing");

        if (!nostrSigner) throw new Error("No Nostr signer available");
        if (!config.relayUrl) throw new Error("GRASP provider requires a relay URL");

        // Get the Git worker - IMPORTANT: We need to use the same worker instance for both API calls and event signing
        const { getGitWorker } = await import("@nostr-git/core");
        const { api, worker } = getGitWorker(); // Get both API and worker from the same call

        // Register the event signing function with the worker
        // This enables the message-based signing protocol
        // We need to use a proxy approach since functions can't be cloned across worker boundaries
        console.log("🔐 Setting up event signer proxy for worker");

        // We'll set up a message handler directly instead of using a separate function

        try {
          if (!signingSetupDone) {
            // Set up a message handler for event signing requests (once)
            console.log("🔐 Setting up event signing message handler");
            worker.addEventListener("message", async (event) => {
              if (event.data.type === "request-event-signing") {
                try {
                  if (!nostrSigner) throw new Error("Missing signer for event signing");
                  console.log("🔐 Received event signing request:", event.data);
                  const signedEvent = await (nostrSigner as NostrGitSigner).sign(event.data.event);
                  console.log("🔐 Event signed successfully");
                  worker.postMessage({
                    type: "event-signed",
                    requestId: event.data.requestId,
                    signedEvent,
                  });
                } catch (error) {
                  console.error("🔐 Error signing event:", error);
                  worker.postMessage({
                    type: "event-signing-error",
                    requestId: event.data.requestId,
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              }
            });
            // Tell the worker that event signing is available
            worker.postMessage({ type: "register-event-signer" });
            signingSetupDone = true;
            console.log("🔐 Event signing setup complete");
          } else {
            console.log("🔐 Event signing already set up; skipping duplicate registration");
          }
        } catch (error) {
          console.error("🔐 Error setting up event signing:", error);
          throw new Error(
            "Failed to set up event signing: " +
              (error instanceof Error ? error.message : String(error))
          );
        }

        // Now we can use the worker API for GRASP repository creation
        // This maintains our API abstraction and keeps all Git operations in the worker
        result = await api.createRemoteRepo({
          provider: config.provider as any,
          token: finalToken, // This is the pubkey for GRASP
          name: config.name,
          description: config.description || "",
          isPrivate: false,
          baseUrl: config.relayUrl, // Pass the relay URL
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
    const { getGitWorker } = await import("@nostr-git/core");
    const { api, worker } = getGitWorker();

    // Get the provider-specific host for token lookup
    const providerHosts: Record<string, string> = {
      github: "github.com",
      gitlab: "gitlab.com",
      gitea: "gitea.com",
      bitbucket: "bitbucket.org",
    };

    let providerToken;
    let nostrSigner: NostrGitSigner | null = null;

    if (config.provider === "grasp") {
      // For GRASP, we need the Nostr signer
      signerStore.subscribe((value) => {
        nostrSigner = value;
      })();

      if (!nostrSigner) {
        throw new Error("No Nostr signer available for GRASP provider");
      }

      // For GRASP, we use the pubkey as the token
      providerToken = await (nostrSigner as NostrGitSigner).getPubkey();

      // Set up message-based signing for GRASP
      console.log("🔐 Setting up event signing message handler for GRASP push");

      // Set up a message handler for event signing requests
      worker.addEventListener("message", async (event) => {
        if (event.data.type === "request-event-signing") {
          try {
            if (!nostrSigner) throw new Error("Missing signer for push signing");
            console.log("🔐 Received event signing request for push:", event.data);
            const signedEvent = await (nostrSigner as NostrGitSigner).sign(event.data.event);
            console.log("🔐 Event signed successfully for push");

            // Send the signed event back to the worker
            worker.postMessage({
              type: "event-signed",
              requestId: event.data.requestId,
              signedEvent,
            });
          } catch (error) {
            console.error("🔐 Error signing event for push:", error);

            // Send the error back to the worker
            worker.postMessage({
              type: "event-signing-error",
              requestId: event.data.requestId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      });

      // Tell the worker that event signing is available
      worker.postMessage({ type: "register-event-signer" });

      console.log("🔐 Event signing setup complete for GRASP push");
    } else {
      const providerHost = providerHosts[config.provider] || config.provider;
      providerToken = tokens.find((t: Token) => t.host === providerHost)?.token;
    }

    // For GRASP, ensure we never try to push over WebSocket; use HTTP(S) endpoint instead
    const toHttpFromWs = (url: string) =>
      url.startsWith("ws://")
        ? "http://" + url.slice(5)
        : url.startsWith("wss://")
          ? "https://" + url.slice(6)
          : url;

    const pushUrl = config.provider === "grasp" ? toHttpFromWs(remoteRepo.url) : remoteRepo.url;

    console.log("🚀 Pushing to remote with URL:", pushUrl);
    console.log("🚀 Push config:", {
      provider: config.provider,
      repoPath: canonicalKey ?? config.name,
      defaultBranch: config.defaultBranch,
      remoteUrl: pushUrl,
      tokenLength: providerToken ? providerToken.length : "No token",
    });

    // Push to remote repository via safe preflight wrapper
    // Note: For GRASP, we don't pass a signer object since signing is handled via message protocol
    // Always use safePushToRemote to resolve the actual default branch and run preflight checks
    console.log("[NEW REPO] Using safePushToRemote for provider:", config.provider);
    const pushResult = await api.safePushToRemote({
      repoId: canonicalKey || config.name,
      remoteUrl: pushUrl,
      branch: config.defaultBranch,
      token: providerToken,
      provider: config.provider as any,
      preflight: {
        blockIfUncommitted: true,
        requireUpToDate: true, // skipped internally for GRASP
        blockIfShallow: false,
      },
    });

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
