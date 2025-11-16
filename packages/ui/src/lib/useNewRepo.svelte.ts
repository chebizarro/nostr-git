import { type Event as NostrEvent } from "nostr-tools";
import { getGitServiceApi, canonicalRepoKey, createEventIO } from "@nostr-git/core";
import { toast } from "./stores/toast.js";
import { tokens as tokensStore, type Token } from "./stores/tokens.js";
import {
  createRepoAnnouncementEvent as createAnnouncementEventShared,
  createRepoStateEvent as createStateEventShared,
} from "@nostr-git/shared-types";
import { tryTokensForHost, getTokensForHost } from "./utils/tokenHelpers.js";

/**
 * Normalize GRASP URLs to ensure proper protocol handling.
 * Converts any input to both wsOrigin and httpOrigin with proper security.
 */
function normalizeGraspOrigins(input: string): { wsOrigin: string; httpOrigin: string } {
  try {
    // Parse the input URL
    const url = new URL(input);
    const host = url.host;

    // Check if the input uses secure protocol (wss:// or https://)
    const isSecure = url.protocol === "wss:" || url.protocol === "https:";

    // Build origins with proper protocols based on input
    const wsOrigin = isSecure ? `wss://${host}` : `ws://${host}`;
    const httpOrigin = isSecure ? `https://${host}` : `http://${host}`;

    return { wsOrigin, httpOrigin };
  } catch (error) {
    // Fallback for malformed URLs - try to extract host with regex
    const hostMatch = input.match(/(?:ws|wss|http|https):\/\/([^\/]+)/);
    if (hostMatch) {
      const host = hostMatch[1];
      // Check if input starts with secure protocol
      const isSecure = input.startsWith("wss://") || input.startsWith("https://");
      const wsOrigin = isSecure ? `wss://${host}` : `ws://${host}`;
      const httpOrigin = isSecure ? `https://${host}` : `http://${host}`;
      return { wsOrigin, httpOrigin };
    }

    // Last resort - assume it's a hostname, default to secure
    const host = input.replace(/^\/\//, "");
    const wsOrigin = `wss://${host}`;
    const httpOrigin = `https://${host}`;
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
      reason: `Failed to check availability: ${error instanceof Error ? error.message : String(error)}`,
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
  const matchingTokens = getTokensForHost(tokens, match || (() => false));

  if (matchingTokens.length === 0) {
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

  // Try all tokens until one succeeds
  try {
    const result = await tryTokensForHost(
      tokens,
      match || (() => false),
      async (token: string, host: string) => {
        const api = getGitServiceApi(provider as any, token);
        const currentUser = await api.getCurrentUser();
        const username = (currentUser as any).login || (currentUser as any).username || "me";

        try {
          await api.getRepo(username, repoName);
          // Exists → conflict
          return {
            results: [
              {
                provider,
                host: host, // Use the host of the token that succeeded
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
                  host: host,
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
                host: host,
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
      }
    );
    return result;
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
  authorPubkey?: string;
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
  userPubkey?: string; // User's nostr pubkey (required for GRASP repos)
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

  // Subscribe to token store changes and update reactive state
  tokensStore.subscribe((t) => {
    tokens = t;
    console.log("🔐 Token store updated, now have", t.length, "tokens");
  });

  const { onProgress, onRepoCreated, onPublishEvent } = options;
  const userPubkey = options.userPubkey;

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
    if (config.authorPubkey) {
      // Use "owner:name" form which canonicalRepoKey will normalize
      return canonicalRepoKey(`${config.authorPubkey}:${config.name}`);
    }
    throw new Error("Could not get pubkey for GRASP canonical key");
  }

  async function createRepository(config: NewRepoConfig): Promise<NewRepoResult | null> {
    if (isCreating) {
      throw new Error("Repository creation already in progress");
    }

    try {
      isCreating = true;
      error = null;
      progress = [];

      // Compute canonical key up-front so all subsequent steps use it
      const canonicalKey = await computeCanonicalKey(config);

      // Step 1: Create local repository
      updateProgress("local", "Creating local repository...", "running");
      const localRepo = await createLocalRepo({ ...config }, canonicalKey);
      updateProgress("local", "Local repository created successfully", "completed");
      // Step 4: Create NIP-34 events (use shared-types helpers)
      // For GRASP, skip this since we already published events before remote creation
      let announcementEvent: any = undefined;
      let stateEvent: any = undefined;

      // Step 1.5: For GRASP only - publish events BEFORE creating remote
      if (config.provider === "grasp") {
        updateProgress("grasp-events", "Publishing GRASP announcement events...", "running");

        // Compute GRASP-specific URLs and relays
        const { wsOrigin, httpOrigin } = normalizeGraspOrigins(config.relayUrl || "");

        // Get pubkey for GRASP (from options)
        const graspPubkey = userPubkey;

        // Build clone and web URLs if we have pubkey
        let cloneUrl: string | undefined;
        let webUrl: string | undefined;
        if (graspPubkey) {
          const npub = (await import("nostr-tools")).nip19.npubEncode(graspPubkey);
          webUrl = `${httpOrigin}/${npub}/${config.name}`;
          cloneUrl = `${webUrl}.git`;
        }

        // Build relay aliases: ensure GRASP relay is present for metadata
        const aliases: string[] = [];
        if (wsOrigin) {
          aliases.push(wsOrigin);
          try {
            const u = new URL(wsOrigin);
            const port = u.port ? `:${u.port}` : "";
            aliases.push(`${u.protocol}//ngit-relay${port}`);
          } catch {}
        }
        const defaultRepoRelays = ["wss://nos.lol/", "wss://relay.damus.io/"];
        aliases.push(...defaultRepoRelays);
        const seen = new Set<string>();
        const relays = aliases.filter((a) => {
          if (seen.has(a)) return false;
          seen.add(a);
          return true;
        });
        // Compute canonical repo address '<npub>:<repo>' (ngit-compatible 'a' tag)
        const ownerNpub = graspPubkey
          ? (await import("nostr-tools")).nip19.npubEncode(graspPubkey)
          : undefined;
        const canonicalRepoId = ownerNpub ? `${ownerNpub}:${config.name}` : config.name;

        // Create announcement event
        announcementEvent = createAnnouncementEventShared({
          repoId: canonicalRepoId,
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
        // Create state event
        // Build full ref names per ngit (refs/heads/<branch>) for HEAD and refs
        const headRef = config.defaultBranch ? `refs/heads/${config.defaultBranch}` : undefined;
        const refs =
          localRepo?.initialCommit && headRef
            ? [
                {
                  type: "heads" as const,
                  name: headRef,
                  commit: localRepo.initialCommit,
                },
              ]
            : undefined;
        stateEvent = createStateEventShared({
          repoId: canonicalRepoId,
          refs,
          head: headRef,
        });
        // Ensure explicit HEAD/ref tags are present (ngit-compatible)
        try {
          stateEvent.tags = stateEvent.tags || [];
          if (headRef && !stateEvent.tags.find((t: any[]) => t[0] === "HEAD")) {
            stateEvent.tags.push(["HEAD", `ref: ${headRef}`]);
          }
          if (
            localRepo?.initialCommit &&
            headRef &&
            !stateEvent.tags.find((t: any[]) => t[0] === "ref" && t[1] === headRef)
          ) {
            stateEvent.tags.push(["ref", headRef, localRepo.initialCommit]);
          }
        } catch {}
        // Ensure app-level publisher sees the GRASP relay on both events: add a 'relays' tag mirroring repo relays
        try {
          const relaysTag = ["relays", ...relays] as unknown as string[];
          // Avoid duplicate relays tag
          if (!stateEvent.tags?.some((t: any[]) => t[0] === "relays")) {
            stateEvent.tags = [...(stateEvent.tags || []), relaysTag];
          }
          announcementEvent.tags = announcementEvent.tags || [];
          if (!announcementEvent.tags?.some((t: any[]) => t[0] === "relays")) {
            announcementEvent.tags = [...(announcementEvent.tags || []), relaysTag];
          }
        } catch {}
        // Publish ANNOUNCEMENT first (triggers server provisioning), then STATE
        if (onPublishEvent) {
          console.log("🔐 publishing announcementEvent (first)", announcementEvent);
          await onPublishEvent(announcementEvent);
          console.log("🔐 publishing stateEvent (second)", stateEvent);
          await onPublishEvent(stateEvent);
          updateProgress("grasp-events", "GRASP state and announcement published", "completed");
        } else {
          console.warn("⚠️ No onPublishEvent callback provided; GRASP events not published");
          updateProgress("grasp-events", "Skipped event publishing (no callback)", "completed");
        }
      }

      // Step 2: Create remote repository
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
          await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 second delay
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

      if (config.provider !== "grasp") {
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
          if (baseRelay) {
            aliases.push(baseRelay);
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

        announcementEvent = createAnnouncementEventShared({
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
        stateEvent = createStateEventShared({
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
      } // End of non-GRASP event handling

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
      const workerInstance = await getGitWorker();
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
        reason: `Failed to check availability: ${error instanceof Error ? error.message : String(error)}`,
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
        if (!config.relayUrl) {
          throw new Error("GRASP provider requires a relay URL");
        }

        // For GRASP, we'll use a placeholder token for now
        finalToken = config.authorPubkey || null;
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

        const matchingTokens = getTokensForHost(tokens, (h) => h === providerHost);

        if (matchingTokens.length === 0) {
          // Try to wait for tokens to load if they're not available yet
          console.log("🔐 No token found for provider, waiting for token store initialization...");
          await tokensStore.waitForInitialization();

          // Refresh tokens after waiting
          await tokensStore.refresh();

          // Try again after waiting and refreshing
          const refreshedTokens = getTokensForHost(tokens, (h) => h === providerHost);

          console.log("🔐 Tokens after refresh:", tokens.length, "tokens");
          console.log("🔐 Matching tokens found after retry:", refreshedTokens.length);

          if (refreshedTokens.length === 0) {
            throw new Error(
              `No ${config.provider} authentication token found. Please add a ${config.provider} token in settings.`
            );
          }
        }

        // Try all tokens until one succeeds (for both availability check and repo creation)
        const result = await tryTokensForHost(
          tokens,
          (h) => h === providerHost!,
          async (token: string, host: string) => {
            // Skip availability check for GRASP; providers with tokens are checked
            if (config.provider !== "grasp") {
              console.log("🚀 Checking repository name availability...");
              const availability = await checkRepoAvailability(config, token);
              if (!availability.available) {
                throw new Error(availability.reason || "Repository name is not available");
              }
            }

            console.log("🚀 Repository name is available, proceeding with creation...");
            console.log("🚀 Calling createRemoteRepo API with:", {
              provider: config.provider,
              name: config.name,
              description: config.description,
              tokenLength: token.length,
              tokenStart: token.substring(0, 8),
              tokenEnd: token.substring(token.length - 8),
            });

            // Standard Git providers - create repo with this token
            const repoResult = await api.createRemoteRepo({
              provider: config.provider as any,
              token: token,
              name: config.name,
              description: config.description,
              isPrivate: false, // Default to public for now
            });

            if (!repoResult.success) {
              console.error("Remote repository creation failed:", repoResult.error);
              throw new Error(`Remote repository creation failed: ${repoResult.error}`);
            }

            return repoResult;
          }
        );

        console.log("🚀 API call completed, result:", result);
        console.log("🚀 Remote repository created successfully:", result);
        return {
          url: result.remoteUrl, // Use remoteUrl from the API response
          provider: result.provider,
          webUrl: result.webUrl || result.remoteUrl, // Fallback to remoteUrl if webUrl not provided
        };
      }

      // Handle GRASP separately (doesn't use token retry logic)
      console.log("🔐 Setting up GRASP repository creation with EventIO (no more signer passing!)");

      if (!config.relayUrl) throw new Error("GRASP provider requires a relay URL");

      // Normalize GRASP URLs to ensure proper protocol handling
      const { wsOrigin, httpOrigin } = normalizeGraspOrigins(config.relayUrl!);
      console.log("🔐 Normalized GRASP URLs:", { wsOrigin, httpOrigin });

      // Get the Git worker - IMPORTANT: We need to use the same worker instance for both API calls and event signing
      // Reuse the api variable already declared above, but get worker instance
      let worker: Worker;
      if (options.workerApi && options.workerInstance) {
        // Use the passed worker API and instance (already configured with EventIO)
        // api is already set above, just get the worker instance
        worker = options.workerInstance;
        console.log("🔐 Using provided worker API and instance");
      } else {
        // Fallback: create new worker (won't have EventIO configured)
        console.warn(
          "🔐 No workerApi/workerInstance provided, creating new worker (EventIO may not be configured)"
        );
        const { getGitWorker } = await import("@nostr-git/core");
        const workerInstance = getGitWorker();
        api = workerInstance.api;
        worker = workerInstance.worker;
      }

      const result = await api.createRemoteRepo({
        provider: config.provider as any,
        token: finalToken, // This is the pubkey for GRASP
        name: config.name,
        description: config.description || "",
        isPrivate: false,
        baseUrl: wsOrigin, // Use normalized WebSocket origin for GRASP API
      });

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
      console.warn(
        "🔐 No workerApi/workerInstance provided for push, creating new worker (EventIO may not be configured)"
      );
      const { getGitWorker } = await import("@nostr-git/core");
      const workerInstance = await getGitWorker();
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

    // For GRASP, ensure we use HTTP(S) endpoint for push operations
    let pushUrl: string;
    if (config.provider === "grasp") {
      // Use the URL from the GRASP API which already has the correct npub format
      pushUrl = remoteRepo.url; // Fixed: use .url not .remoteUrl
      console.log("🔐 Using GRASP API URL for push:", { pushUrl });

      // For GRASP, we use EventIO instead of explicit signer passing
      console.log("🔐 GRASP push - EventIO handles signing internally (no more signer passing!)");
      const providerToken = config.authorPubkey || "";

      console.log("🚀 Pushing to remote with URL:", pushUrl);
      console.log("🚀 Push config:", {
        provider: config.provider,
        repoPath: canonicalKey ?? config.name,
        defaultBranch: config.defaultBranch,
        remoteUrl: pushUrl,
        tokenLength: providerToken ? providerToken.length : "No token",
      });

      // For GRASP, use direct push since we just created the local repo
      console.log("[NEW REPO] Using direct pushToRemote for GRASP");
      const directPushResult = await api.pushToRemote({
        repoId: canonicalKey || config.name,
        remoteUrl: pushUrl,
        branch: config.defaultBranch,
        token: providerToken,
        provider: config.provider as any,
      });
      const pushResult = {
        success: directPushResult?.success || false,
        pushed: directPushResult?.success,
      };

      if (!pushResult.success) {
        throw new Error("Failed to push to GRASP remote repository");
      }

      return pushResult;
    } else {
      // For standard Git providers, try all tokens until one succeeds
      pushUrl = remoteRepo.url;
      const providerHost = providerHosts[config.provider] || config.provider;

      const matchingTokens = getTokensForHost(tokens, (h) => h === providerHost);
      if (matchingTokens.length === 0) {
        throw new Error(`No ${config.provider} authentication token found for push operation`);
      }

      const pushResult = await tryTokensForHost(
        tokens,
        (h) => h === providerHost,
        async (token: string, host: string) => {
          console.log("🚀 Pushing to remote with URL:", pushUrl);
          console.log("🚀 Push config:", {
            provider: config.provider,
            repoPath: canonicalKey ?? config.name,
            defaultBranch: config.defaultBranch,
            remoteUrl: pushUrl,
            tokenLength: token.length,
          });

          // For other providers, use safePushToRemote for preflight checks
          console.log("[NEW REPO] Using safePushToRemote for non-GRASP provider");
          const result = await api.safePushToRemote({
            repoId: canonicalKey || config.name,
            remoteUrl: pushUrl,
            branch: config.defaultBranch,
            token: token,
            provider: config.provider as any,
            preflight: {
              blockIfUncommitted: true,
              requireUpToDate: true,
              blockIfShallow: false,
            },
          });

          if (!result?.success) {
            if (result?.requiresConfirmation) {
              throw new Error(result.warning || "Force push requires confirmation.");
            }
            throw new Error(result?.error || "Safe push failed");
          }

          return result;
        }
      );

      console.log("[NEW REPO] Push result:", pushResult);
      return remoteRepo;
    }
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
