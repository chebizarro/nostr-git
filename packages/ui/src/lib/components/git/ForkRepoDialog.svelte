<script lang="ts">
  import {
    X,
    GitFork,
    AlertCircle,
    CheckCircle2,
    Loader2,
    ChevronDown,
    ExternalLink,
    GitCommit,
  } from "@lucide/svelte";
  import { Repo } from "./Repo.svelte";
  import { useForkRepo } from "../../hooks/useForkRepo.svelte";
  import { tokens } from "$lib/stores/tokens";
  import type { RepoAnnouncementEvent, RepoStateEvent } from "@nostr-git/shared-types";
  import type { Token } from "$lib/stores/tokens";
  import type { ForkResult } from "../../hooks/useForkRepo.svelte";
  import { getGitServiceApi } from "@nostr-git/core";
  import { toast } from "../../stores/toast";
  import { validateGraspServerUrl } from "@nostr-git/core";
  // Load user's GRASP servers directly (so chips are reactive even if prop is static)

  interface Props {
    repo: Repo;
    pubkey: string;
    onPublishEvent: (event: RepoAnnouncementEvent | RepoStateEvent) => Promise<void>;
    graspServerUrls?: string[]; // Optional list of known GRASP servers to display
    // Optional DI: override the useForkRepo hook (for Storybook/tests)
    useForkRepoImpl?: typeof useForkRepo;
  }

  const { repo, pubkey, onPublishEvent, graspServerUrls = [], useForkRepoImpl }: Props = $props();

  // Initialize the useForkRepo hook (allow DI override)
  const forkImpl = useForkRepoImpl ?? useForkRepo;
  const forkState = forkImpl({
    onProgress: (steps) => {
      // Progress is handled internally by the hook
      console.log("🔄 Fork progress:", steps);
    },
    onForkCompleted: (result) => {
      console.log("🎉 Fork completed:", result);
      completedResult = result;
    },
    onPublishEvent: onPublishEvent,
  });

  // Access reactive state through getters
  const progress = $derived(forkState.progress);
  const error = $derived(forkState.error);
  const isForking = $derived(forkState.isForking);
  let completedResult = $state<ForkResult | null>(null);
  let showDetails = $state(false);
  let dialogEl = $state<HTMLDivElement | null>(null);
  let initialFocusEl = $state<HTMLInputElement | null>(null);

  // Extract repository information from Repo instance
  const cloneUrl = repo.clone?.[0] || "";
  let isOpen = $state(true);

  // Parse owner and repo name from clone URL
  const urlMatch = cloneUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/);
  const originalRepo = {
    owner: urlMatch?.[1] || "unknown",
    name: urlMatch?.[2] || "repository",
    description: repo.description || "",
  };
  // Form state
  let forkName = $state(`${originalRepo.name}-fork`);
  let selectedService = $state<string>("github.com"); // Default to GitHub
  let isCheckingExistingFork = $state(false);
  let existingForkInfo = $state<{
    exists: boolean;
    url?: string;
    message?: string;
    service?: string;
    error?: string;
  } | null>(null);
  // GRASP-specific state
  let relayUrl = $state("");
  let relayUrlError = $state<string | undefined>();
  
  // Commit selection state
  let earliestUniqueCommit = $state("");
  let availableCommits: Array<any> = [];
  let loadingCommits = $state(false);
  let commitSearchQuery = $state("");
  let showCommitDropdown = $state(false);

  // Local reactive list of GRASP servers. Seed from prop, keep updated from profile and prop changes.
  let graspServerUrlsLocal = $state<string[]>([...(graspServerUrls || [])]);

  // Keep local list in sync with prop updates, but don't clobber non-empty local list with empty props.
  $effect(() => {
    const incoming = (graspServerUrls || []).map((u) => u.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    const current = (graspServerUrlsLocal || []).map((u) => u.trim()).filter(Boolean);
    const changed = incoming.length !== current.length || incoming.some((u, i) => u !== current[i]);
    if (changed) {
      // de-dup
      const set = Array.from(new Set(incoming));
      graspServerUrlsLocal = set;
    }
  });

  const knownGraspServers = $derived.by(() =>
    (graspServerUrlsLocal || []).map((u) => u.trim()).filter(Boolean)
  );
  
  // Load commits on mount
  $effect(() => {
    if (repo) {
      loadingCommits = true;
      const existingCommits = repo.commits;
      if (existingCommits && existingCommits.length > 0) {
        availableCommits = existingCommits;
        loadingCommits = false;
      } else {
        repo.getCommitHistory({ depth: 100 })
          .then((commits) => {
            availableCommits = commits || repo.commits || [];
            loadingCommits = false;
          })
          .catch((error) => {
            console.error("Failed to load commit history:", error);
            availableCommits = repo.commits || [];
            loadingCommits = false;
          });
      }
    }
  });
  
  // Filter commits based on search query
  let filteredCommits = $derived.by(() => {
    if (!commitSearchQuery) return availableCommits.slice(0, 20);
    const query = commitSearchQuery.toLowerCase();
    return availableCommits
      .filter(c => {
        const oid = c.oid || '';
        const message = c.message || c.commit?.message || '';
        const author = c.author || c.commit?.author?.name || '';
        return oid.toLowerCase().includes(query) ||
               message.toLowerCase().includes(query) ||
               author.toLowerCase().includes(query);
      })
      .slice(0, 20);
  });

  // Get available git services from tokens
  let tokenList = $state<Token[]>([]);
  tokens.subscribe((t) => {
    tokenList = t;
  });

  const availableServices = $derived.by(() => {
    const services = tokenList
      .filter((token) => ["github.com", "gitlab.com", "bitbucket.org"].includes(token.host))
      .map((token) => ({
        host: token.host,
        label:
          token.host === "github.com"
            ? "GitHub"
            : token.host === "gitlab.com"
              ? "GitLab"
              : token.host === "bitbucket.org"
                ? "Bitbucket"
                : token.host,
      }));

    // Always include GRASP option regardless of tokens
    services.push({ host: "grasp", label: "GRASP (Nostr)" });

    return services;
  });

  // Ensure selected service remains valid based on availableServices
  $effect(() => {
    const services = availableServices;
    if (!services || services.length === 0) return;
    if (!services.some((s) => s.host === selectedService)) {
      const fallback = services.find((s) => s.host === "github.com")?.host || "grasp";
      if (selectedService !== fallback) {
        selectedService = fallback;
      }
    }
  });

  // Debug initial state
  console.log("🏁 ForkRepoDialog: Initial state", {
    originalRepo,
  });

  // Computed properties
  const progressLength = $derived(progress?.length || 0);

  // UI state
  let validationError = $state<string | undefined>();

  function validateForkName(name: string): string | undefined {
    if (!name.trim()) {
      return "Fork name is required";
    }

    if (name.length < 1 || name.length > 100) {
      return "Fork name must be between 1 and 100 characters";
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return "Fork name can only contain letters, numbers, dots, hyphens, and underscores";
    }

    return undefined;
  }

  // Validate fork name on input
  $effect(() => {
    validationError = validateForkName(forkName);
  });

  // Focus management: move focus into dialog on open
  $effect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        if (initialFocusEl && typeof initialFocusEl.focus === "function") {
          initialFocusEl.focus();
        }
      });
    }
  });

  // Debounced fork checking to prevent excessive API calls
  let checkTimeout: ReturnType<typeof setTimeout> | undefined;
  let lastCheckedKey = $state<string>("");

  // Check for existing fork when service or fork name changes (debounced)
  $effect(() => {
    const currentKey = `${selectedService}:${forkName.trim()}`;

    // Clear existing timeout
    if (checkTimeout) {
      clearTimeout(checkTimeout);
    }

    // Skip if we already checked this combination
    if (
      currentKey === lastCheckedKey ||
      !selectedService ||
      !forkName.trim() ||
      availableServices.length === 0
    ) {
      return;
    }

    // Reset existing fork info immediately to show we're about to check
    existingForkInfo = null;

    // Debounce the API call by 500ms
    checkTimeout = setTimeout(() => {
      checkExistingFork(currentKey);
    }, 500);
  });

  // Function to check if fork already exists on selected service
  async function checkExistingFork(checkKey: string) {
    // Prevent concurrent checks and validate inputs
    if (isCheckingExistingFork || !selectedService || !forkName.trim()) {
      return;
    }

    // Skip if this check is already outdated (user changed inputs)
    const currentKey = `${selectedService}:${forkName.trim()}`;
    if (checkKey !== currentKey) {
      return;
    }

    // For GRASP, skip remote fork existence checks (event-based system)
    if (selectedService === "grasp") {
      existingForkInfo = {
        exists: false,
        service: "grasp",
        message: "Fork existence check is not applicable for GRASP.",
      };
      lastCheckedKey = checkKey;
      return;
    }

    isCheckingExistingFork = true;
    existingForkInfo = null;

    try {
      const token = tokenList.find((t) => t.host === selectedService)?.token;
      if (!token) {
        existingForkInfo = {
          exists: false,
          message: `No token found for ${selectedService}`,
        };
        return;
      }

      // Check if fork exists based on service
      if (selectedService === "github.com") {
        // Get current user info and check if fork already exists
        const api = getGitServiceApi("github", token);
        const userData = await api.getCurrentUser();
        const username = userData.login;

        // Check if fork already exists
        try {
          await api.getRepo(username, forkName);
          // Fork exists
          toast.push({
            message: `Fork '${forkName}' already exists in your GitHub account`,
            theme: "error",
          });
          return;
        } catch (error: any) {
          // Fork doesn't exist (good!) - continue with fork creation
          if (!error.message?.includes("404") && !error.message?.includes("Not Found")) {
            // Some other error occurred
            throw error;
          }
        }

        // Repository check is already done above - fork doesn't exist, so we can proceed
        existingForkInfo = {
          exists: false,
          service: selectedService,
        };
      } else {
        // For other services, show placeholder
        existingForkInfo = {
          exists: false,
          service: selectedService,
          message: `Fork checking not yet implemented for ${selectedService}`,
        };
      }

      // Mark this combination as checked to prevent redundant calls
      lastCheckedKey = checkKey;
    } catch (error) {
      console.error("Error checking existing fork:", error);
      existingForkInfo = {
        exists: false,
        service: selectedService,
        error: error instanceof Error ? error.message : "Unknown error",
      };
      // Don't update lastCheckedKey on error so we can retry
    } finally {
      isCheckingExistingFork = false;
    }
  }

  // Handle service selection change
  function handleServiceChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    selectedService = target.value;
    existingForkInfo = null; // Reset fork check when service changes
    // Reset relay URL error when switching services
    if (selectedService !== "grasp") {
      relayUrlError = undefined;
    }
  }

  function handleSelectKnownRelay(url: string) {
    const val = (url || "").trim();
    relayUrl = val;
    if (!val) {
      relayUrlError = "Relay URL is required for GRASP";
      return;
    }
    const ok = validateGraspServerUrl(val) || /^wss?:\/\//i.test(val);
    relayUrlError = ok ? undefined : "Invalid relay URL. Must start with ws:// or wss://";
  }

  // Computed properties for progress handling
  const isProgressComplete = $derived.by(() => {
    // If no progress or empty progress array, fork hasn't started yet
    if (!progress || progress.length === 0) return false;
    // Only complete if we have progress steps AND all are completed
    const result = progress.length > 0 && progress.every((step) => step.status === "completed");
    console.log("🔍 ForkRepoDialog: isProgressComplete =", result, {
      progress,
      progressLength: progress?.length,
    });
    return result;
  });

  const currentProgressMessage = $derived.by(() => {
    if (!progress || progress.length === 0) return "";
    const runningStep = progress.find((step) => step.status === "running");
    if (runningStep) return runningStep.message;
    const lastStep = progress[progress.length - 1];
    return lastStep?.message || "";
  });

  function handleClose() {
    console.log("🔄 ForkRepoDialog: handleClose called", { isForking, isOpen });
    if (!isForking) {
      completedResult = null;
      showDetails = false;
      console.log(
        "✅ ForkRepoDialog: Closing dialog - setting isOpen to false and navigating back"
      );
      isOpen = false;
      // Use browser history API to go back (framework-agnostic)
      window.history.back();
    } else {
      console.log("⚠️ ForkRepoDialog: Cannot close - fork operation in progress");
    }
  }

  async function copyForkUrl() {
    try {
      const url = completedResult?.forkUrl?.replace(/\.git$/, "") || "";
      if (!url) return;
      await navigator.clipboard.writeText(url);
      toast.push({ message: "Copied fork URL to clipboard", variant: "default" });
    } catch (e) {
      toast.push({ message: "Failed to copy URL", theme: "error" });
    }
  }

  async function copyCloneCommand() {
    try {
      const url = completedResult?.forkUrl || "";
      if (!url) return;
      const cmd = `git clone ${url}`;
      await navigator.clipboard.writeText(cmd);
      toast.push({ message: "Copied git clone command", variant: "default" });
    } catch (e) {
      toast.push({ message: "Failed to copy command", theme: "error" });
    }
  }

  async function handleFork() {
    console.log("🚀 ForkRepoDialog: handleFork called", {
      forkName,
      originalRepo,
      selectedService,
    });
    completedResult = null;
    showDetails = false;

    // Validate service availability
    if (availableServices.length === 0) {
      console.log("❌ ForkRepoDialog: No git services available");
      return;
    }

    // Check if fork already exists
    if (existingForkInfo?.exists) {
      console.log("❌ ForkRepoDialog: Fork already exists");
      return;
    }

    const nameError = validateForkName(forkName);
    if (nameError) {
      console.log("❌ ForkRepoDialog: Validation error:", nameError);
      validationError = nameError;
      return;
    }

    console.log("🚀 ForkRepoDialog: Starting fork operation with config:", {
      forkName,
      selectedService,
      visibility: "public",
    });

    try {
      // All services are now supported via GitServiceApi abstraction
      console.log("🚀 ForkRepoDialog: Fork operation supported for service:", selectedService);

      // Validate relay URL when GRASP is selected
      let relayParam: string | undefined = undefined;
      if (selectedService === "grasp") {
        const val = relayUrl.trim();
        if (!val) {
          relayUrlError = "Relay URL is required for GRASP";
          return;
        }
        const ok = validateGraspServerUrl(val) || /^wss?:\/\//i.test(val);
        if (!ok) {
          relayUrlError = "Invalid relay URL. Must start with ws:// or wss://";
          return;
        }
        relayUrlError = undefined;
        relayParam = val;
      }

      const result = await forkState.forkRepository(originalRepo, {
        forkName,
        visibility: "public",
        provider:
          selectedService === "github.com"
            ? "github"
            : selectedService === "gitlab.com"
              ? "gitlab"
              : selectedService === "gitea.com"
                ? "gitea"
                : selectedService === "bitbucket.org"
                  ? "bitbucket"
                  : selectedService === "grasp"
                    ? "grasp"
                    : "github",
        relayUrl: relayParam,
        earliestUniqueCommit: earliestUniqueCommit || undefined,
      });

      if (result) {
        console.log("✅ ForkRepoDialog: Fork completed successfully:", result);
      }
    } catch (error) {
      console.error("❌ ForkRepoDialog: Fork failed:", error);
    }

    // Note: handleClose is called by onForkCompleted callback
    if (!isForking) {
      handleClose();
    }
  }

  function handleRetry() {
    if (error && !isForking) {
      handleFork();
    }
  }

  // Submit via Enter on inputs; prevent default form navigation
  function onFormSubmit(event: Event) {
    event.preventDefault();
    if (!isForking) {
      handleFork();
    }
  }

  // Prevent dialog close when forking
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !isForking) {
      handleClose();
    }
  }

  // Handle keyboard events for accessibility
  function handleBackdropKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !isForking) {
      handleClose();
    }
  }

  // Trap focus within the dialog
  function handleKeydownTrap(event: KeyboardEvent) {
    if (event.key !== "Tab" || !dialogEl) return;
    const focusableSelectors = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const nodes = Array.from(dialogEl.querySelectorAll<HTMLElement>(focusableSelectors)).filter(
      (el) => el.offsetParent !== null
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const forward = !event.shiftKey;
    if (forward && active === last) {
      event.preventDefault();
      first.focus();
    } else if (!forward && active === first) {
      event.preventDefault();
      last.focus();
    }
  }
</script>

<svelte:window onkeydown={handleBackdropKeydown} />

<!-- Fork Repository Dialog -->
{#if isOpen}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 isolate"
    role="dialog"
    aria-modal="true"
    aria-labelledby="fork-dialog-title"
    aria-busy={isForking}
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleBackdropKeydown}
  >
    <div
      bind:this={dialogEl}
      class="bg-gray-900 rounded-lg shadow-xl w-full max-w-md border border-gray-700 overflow-hidden relative z-[60] outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 transform-gpu"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-700">
        <div class="flex items-center space-x-3">
          <GitFork class="w-6 h-6 text-blue-400" />
          <h2 id="fork-dialog-title" class="text-xl font-semibold text-white">Fork Repository</h2>
        </div>
        {#if !isForking}
          <button
            type="button"
            onclick={handleClose}
            class="text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close dialog"
          >
            <X class="w-5 h-5" />
          </button>
        {/if}
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        <!-- Original Repository Info -->
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-600">
          <div class="flex items-start space-x-3">
            <GitFork class="w-5 h-5 text-gray-400 mt-0.5" />
            <div class="flex-1 min-w-0">
              <h3 class="text-sm font-medium text-white">
                {originalRepo.owner}/{originalRepo.name}
              </h3>
              {#if originalRepo.description}
                <p class="text-sm text-gray-400 mt-1">{originalRepo.description}</p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Fork Configuration -->
        {#if !isForking && !isProgressComplete}
          <form id="fork-form" class="space-y-4" onsubmit={onFormSubmit}>
            <!-- Git Service Selection -->
            {#if availableServices.length > 0}
              <div>
                <label for="git-service" class="block text-sm font-medium text-gray-300 mb-2">
                  Git Service *
                </label>
                <div class="relative">
                  <select
                    id="git-service"
                    bind:value={selectedService}
                    onchange={handleServiceChange}
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none pr-10"
                  >
                    {#each availableServices as service}
                      <option value={service.host}>{service.label}</option>
                    {/each}
                  </select>
                  <ChevronDown
                    class="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  />
                </div>
                <p class="mt-1 text-xs text-gray-400">
                  Fork will be created on {availableServices.find((s) => s.host === selectedService)
                    ?.label || selectedService}
                </p>
              </div>
              {#if selectedService === "grasp"}
                <div>
                  <label for="relay-url" class="block text-sm font-medium text-gray-300 mb-2">
                    GRASP Relay URL (ws:// or wss://) *
                  </label>
                  <input
                    id="relay-url"
                    type="text"
                    bind:value={relayUrl}
                    placeholder="wss://relay.example.com"
                    class="w-full px-3 py-2 bg-gray-800 border {relayUrlError
                      ? 'border-red-500'
                      : 'border-gray-600'} rounded-lg text-white focus:outline-none focus:ring-2 {relayUrlError
                      ? 'focus:ring-red-500'
                      : 'focus:ring-blue-500'} focus:border-transparent"
                    aria-invalid={!!relayUrlError}
                    aria-describedby={relayUrlError ? "relay-url-error" : undefined}
                  />
                  {#if relayUrlError}
                    <p
                      id="relay-url-error"
                      class="mt-1 text-sm text-red-400 flex items-center gap-1"
                    >
                      <AlertCircle class="w-4 h-4" />
                      {relayUrlError}
                    </p>
                  {/if}
                  {#if knownGraspServers.length > 0}
                    <div class="mt-3">
                      <p class="text-xs text-gray-400 mb-2">Your GRASP servers</p>
                      <div class="flex flex-wrap gap-2">
                        {#each knownGraspServers as url}
                          <button
                            type="button"
                            class="px-2.5 py-1 text-xs rounded border {relayUrl === url
                              ? 'border-blue-500 text-blue-300 bg-blue-500/10'
                              : 'border-gray-600 text-gray-300 hover:border-gray-500'}"
                            onclick={() => handleSelectKnownRelay(url)}
                            title="Use this relay URL"
                          >
                            {url}
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            {:else}
              <div class="bg-yellow-900/50 border border-yellow-500 rounded-lg p-4">
                <div class="flex items-start space-x-3">
                  <AlertCircle class="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 class="text-yellow-400 font-medium mb-1">No Git Service Tokens</h4>
                    <p class="text-yellow-300 text-sm">
                      You need to add authentication tokens for git services (GitHub, GitLab, etc.)
                      to fork repositories.
                    </p>
                  </div>
                </div>
              </div>
            {/if}

            <!-- Fork Name -->
            <div>
              <label for="fork-name" class="block text-sm font-medium text-gray-300 mb-2">
                Repository name *
              </label>
              <input
                id="fork-name"
                type="text"
                bind:value={forkName}
                bind:this={initialFocusEl}
                placeholder="Enter fork name"
                disabled={availableServices.length === 0}
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                aria-invalid={!!validationError}
                aria-describedby={validationError ? "fork-name-error" : undefined}
              />
              {#if validationError}
                <p
                  id="fork-name-error"
                  class="mt-1 text-sm text-red-400 flex items-center space-x-1"
                >
                  <AlertCircle class="w-4 h-4" />
                  <span>{validationError}</span>
                </p>
              {/if}
            </div>

            <!-- Earliest Unique Commit -->
            <div>
              <label for="earliest-commit" class="block text-sm font-medium text-gray-300 mb-2">
                <GitCommit class="w-4 h-4 inline mr-1" />
                Earliest Unique Commit {loadingCommits ? "(loading...)" : ""}
              </label>
              <div class="relative">
                <input
                  id="earliest-commit"
                  type="text"
                  bind:value={commitSearchQuery}
                  onfocus={() => showCommitDropdown = availableCommits.length > 0}
                  onblur={() => setTimeout(() => showCommitDropdown = false, 200)}
                  disabled={loadingCommits}
                  autocomplete="off"
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
                  placeholder={earliestUniqueCommit || "Search commits or paste commit hash..."}
                />
                {#if showCommitDropdown && filteredCommits.length > 0}
                  <div class="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                    {#each filteredCommits as commit}
                      <button
                        type="button"
                        onclick={() => {
                          earliestUniqueCommit = commit.oid;
                          commitSearchQuery = "";
                          showCommitDropdown = false;
                        }}
                        class="w-full text-left px-3 py-2 hover:bg-gray-700 border-b border-gray-700 last:border-b-0"
                      >
                        <div class="flex items-start gap-2">
                          <GitCommit class="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div class="flex-1 min-w-0">
                            <div class="text-xs font-mono text-blue-400">{commit.oid?.slice(0, 7) || 'unknown'}</div>
                            <div class="text-sm text-white truncate">{commit.message?.split('\n')[0] || commit.commit?.message?.split('\n')[0] || 'No message'}</div>
                            <div class="text-xs text-gray-400 mt-0.5">
                              {commit.author || commit.commit?.author?.name || 'Unknown'} · {new Date((commit.timestamp || commit.commit?.author?.timestamp || 0) * 1000).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
              {#if earliestUniqueCommit}
                <div class="mt-2 p-2 bg-gray-800/50 rounded text-xs font-mono text-gray-300 flex items-center justify-between">
                  <span class="truncate">{earliestUniqueCommit}</span>
                  <button
                    type="button"
                    onclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      earliestUniqueCommit = "";
                    }}
                    class="ml-2 text-red-400 hover:text-red-300 flex-shrink-0"
                    aria-label="Clear commit"
                  >
                    <X class="w-4 h-4" />
                  </button>
                </div>
              {/if}
              <p class="text-gray-400 text-xs mt-1">
                The commit ID of the earliest unique commit to identify this fork among other forks
              </p>
            </div>

            <!-- Existing Fork Status -->
            {#if isCheckingExistingFork}
              <div class="bg-gray-800 border border-gray-600 rounded-lg p-3">
                <div class="flex items-center space-x-2 text-sm text-gray-300">
                  <Loader2 class="w-4 h-4 animate-spin" />
                  <span>Checking if fork already exists...</span>
                </div>
              </div>
            {:else if existingForkInfo}
              <div class="bg-gray-800 border border-gray-600 rounded-lg p-3">
                <div class="flex items-start space-x-2 text-sm">
                  {#if existingForkInfo.exists}
                    <AlertCircle class="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div class="flex-1">
                      <p class="text-yellow-400 font-medium">{existingForkInfo.message}</p>
                      {#if existingForkInfo.url}
                        <a
                          href={existingForkInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 mt-1"
                        >
                          <span>View existing repository</span>
                          <ExternalLink class="w-3 h-3" />
                        </a>
                      {/if}
                    </div>
                  {:else}
                    <CheckCircle2 class="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                    <p class="text-green-400">{existingForkInfo.message}</p>
                  {/if}
                </div>
              </div>
            {/if}
          </form>
        {/if}

        <!-- Live region for screen readers (status updates) -->
        <div class="sr-only" aria-live="polite">
          {#if error}
            Fork failed: {error}
          {:else if isForking}
            {currentProgressMessage}
          {:else if isProgressComplete}
            Fork completed successfully.
          {/if}
        </div>

        <!-- Error Display -->
        {#if error}
          <div class="bg-red-900/50 border border-red-500 rounded-lg p-4">
            <div class="flex items-start space-x-3">
              <AlertCircle class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <h4 class="text-red-400 font-medium mb-1">Fork Failed</h4>
                <p class="text-red-300 text-sm">{error}</p>
                {#if !isForking}
                  <button
                    type="button"
                    onclick={handleRetry}
                    class="mt-3 text-red-400 hover:text-red-300 text-sm underline"
                  >
                    Try again
                  </button>
                {/if}
              </div>
            </div>
          </div>
          <!-- Progress Display -->
        {:else if isProgressComplete}
          <!-- Success Summary -->
          <div class="space-y-4">
            <div class="flex items-center space-x-3">
              <CheckCircle2 class="w-5 h-5 text-green-400" />
              <span class="text-green-400 font-medium">Fork completed successfully!</span>
            </div>

            <div class="bg-gray-800 rounded-lg p-4 border border-gray-600">
              <p class="text-sm text-gray-300">Your fork is ready:</p>
              <div class="mt-2 flex items-center justify-between gap-3">
                <a
                  href={(completedResult?.forkUrl || "").replace(/\.git$/, "")}
                  target="_blank"
                  rel="noreferrer noopener"
                  class="text-blue-400 hover:text-blue-300 break-all inline-flex items-center gap-1"
                >
                  <span>{(completedResult?.forkUrl || "").replace(/\.git$/, "")}</span>
                  <ExternalLink class="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onclick={copyForkUrl}
                  class="px-2 py-1 text-xs border border-gray-600 rounded text-gray-300 hover:text-white hover:border-gray-500"
                  >Copy URL</button
                >
              </div>
            </div>

            {#if completedResult?.defaultBranch}
              <div class="text-xs text-gray-400">
                Default branch: <span class="text-gray-300">{completedResult.defaultBranch}</span>
              </div>
            {/if}

            <!-- Compact details toggle -->
            <div class="mt-2">
              <button
                type="button"
                class="text-xs text-gray-300 hover:text-white inline-flex items-center gap-1"
                onclick={() => (showDetails = !showDetails)}
                aria-expanded={showDetails}
              >
                <ChevronDown
                  class={"w-3 h-3 transition-transform " + (showDetails ? "rotate-180" : "")}
                />
                {showDetails ? "Hide details" : "Show details"}
              </button>
            </div>

            {#if showDetails}
              <div
                class="mt-2 rounded-md border border-gray-700 bg-gray-900 p-3 text-xs text-gray-300 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <span>Clone with Git</span>
                  <button
                    type="button"
                    onclick={copyCloneCommand}
                    class="px-2 py-1 border border-gray-700 rounded hover:border-gray-600"
                    >Copy</button
                  >
                </div>
                <code class="block bg-black/40 rounded px-2 py-1 break-all"
                  >git clone {completedResult?.forkUrl}</code
                >
                <div>
                  <span class="text-gray-400">Repository:</span>
                  <span class="ml-1">{originalRepo.owner}/{forkName}</span>
                </div>
                {#if completedResult?.branches?.length}
                  <div class="text-gray-400">
                    Branches: <span class="text-gray-300"
                      >{completedResult.branches.join(", ")}</span
                    >
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {:else if isForking && progress && progress.length > 0}
          <div class="space-y-4">
            <div class="flex items-center space-x-3">
              {#if isProgressComplete}
                <CheckCircle2 class="w-5 h-5 text-green-400" />
                <span class="text-green-400 font-medium">Fork completed successfully!</span>
              {:else}
                <Loader2 class="w-5 h-5 text-blue-400 animate-spin" />
                <span class="text-white">{currentProgressMessage}</span>
              {/if}
            </div>

            <!-- Progress Steps -->
            <div class="space-y-2">
              {#each progress as step}
                <div class="flex items-center space-x-2 text-sm">
                  {#if step.status === "completed"}
                    <CheckCircle2 class="w-4 h-4 text-green-400" />
                    <span class="text-green-400">{step.message}</span>
                  {:else if step.status === "running"}
                    <Loader2 class="w-4 h-4 text-blue-400 animate-spin" />
                    <span class="text-blue-400">{step.message}</span>
                  {:else if step.status === "error"}
                    <AlertCircle class="w-4 h-4 text-red-400" />
                    <span class="text-red-400">{step.message}</span>
                  {:else}
                    <div class="w-4 h-4 rounded-full border-2 border-gray-600"></div>
                    <span class="text-gray-400">{step.message}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      {#if !isProgressComplete}
        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
          <button
            type="button"
            onclick={handleClose}
            disabled={isForking}
            class="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="fork-form"
            disabled={isForking ||
              !!validationError ||
              !forkName.trim() ||
              availableServices.length === 0 ||
              existingForkInfo?.exists}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {#if isForking}
              <Loader2 class="w-4 h-4 animate-spin" />
              <span>Forking...</span>
            {:else}
              <GitFork class="w-4 h-4" />
              <span>Fork repository</span>
            {/if}
          </button>
        </div>
      {:else}
        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
          <button
            type="button"
            onclick={handleClose}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Close
            <CheckCircle2 class="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
