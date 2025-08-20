<script lang="ts">
  import {
    Settings,
    Save,
    X,
    AlertCircle,
    CheckCircle2,
    Loader2,
    GitBranch,
    FileText,
    Users,
    Globe,
    Link,
    Hash,
    GitCommit,
    Plus,
    Trash2,
  } from "@lucide/svelte";
  import type { NostrEvent } from "nostr-tools";
  import { nip19 } from "nostr-tools";
  import { Repo } from "./Repo.svelte";

  // Types for edit configuration and progress
  interface EditProgress {
    stage: string;
    percentage: number;
    isComplete: boolean;
  }

  interface FormData {
    name: string;
    description: string;
    visibility: 'public' | 'private';
    defaultBranch: string;
    maintainers: string[];
    relays: string[];
    webUrls: string[];
    cloneUrls: string[];
    hashtags: string[];
    earliestUniqueCommit: string;
  }

  // Component props
  interface Props {
    repo: Repo;
    onPublishEvent: (event: NostrEvent) => Promise<void>;
    progress?: EditProgress;
    error?: string;
    isEditing?: boolean;
  }

  const {
    repo,
    onPublishEvent,
    progress,
    error,
    isEditing = false,
  }: Props = $props();

  // Extract current values from repo
  function extractCurrentValues(): FormData {
    if (!repo.repo) {
      return {
        name: "",
        description: "",
        visibility: "public" as "public" | "private",
        defaultBranch: "",
        maintainers: [],
        relays: [],
        webUrls: [],
        cloneUrls: [],
        hashtags: [],
        earliestUniqueCommit: "",
      };
    }

    // Use the parsed repo data from the Repo class instead of manually parsing tags
    const repoData = repo.repo;

    // Get default branch from repo's mainBranch property (already resolved)
    const defaultBranch = repo.mainBranch || "";

    // Determine visibility from clone URL (basic heuristic)
    const cloneUrl = repoData.clone?.[0] || "";
    const isPrivate = cloneUrl.includes("private") || false;

    return {
      name: repoData.name || "",
      description: repoData.description || "",
      visibility: isPrivate ? "private" : ("public" as "public" | "private"),
      defaultBranch,
      maintainers: repoData.maintainers || [],
      relays: repoData.relays || [],
      webUrls: repoData.web || [],
      cloneUrls: repoData.clone || [],
      hashtags: repoData.hashtags || [],
      earliestUniqueCommit: repoData.earliestUniqueCommit || "",
    };
  }

  // Form state - initialize with current values
  let formData = $state<FormData>(extractCurrentValues());

  // Load repository references with robust fallback logic
  let availableRefs: Array<{name: string; type: "heads" | "tags"; fullRef: string; commitId: string}> = []
  let loadingRefs = $state(true)

  // Load refs when component mounts
  $effect(() => {
    if (repo) {
      loadingRefs = true
      repo.getAllRefsWithFallback()
        .then(refs => {
          availableRefs = refs
          loadingRefs = false
        })
        .catch(error => {
          console.error('Failed to load repository references:', error)
          availableRefs = []
          loadingRefs = false
        })
    }
  })

  // Get available branches for dropdown
  let availableBranches = $derived(availableRefs.filter(ref => ref.type === "heads"))

  // Helper functions for multi-value fields
  function addArrayItem(field: keyof Pick<FormData, 'maintainers' | 'relays' | 'webUrls' | 'cloneUrls' | 'hashtags'>) {
    formData[field] = [...formData[field], ""];
  }

  function removeArrayItem(field: keyof Pick<FormData, 'maintainers' | 'relays' | 'webUrls' | 'cloneUrls' | 'hashtags'>, index: number) {
    formData[field] = formData[field].filter((_, i) => i !== index);
  }

  function updateArrayItem(field: keyof Pick<FormData, 'maintainers' | 'relays' | 'webUrls' | 'cloneUrls' | 'hashtags'>, index: number, value: string) {
    formData[field] = formData[field].map((item, i) => i === index ? value : item);
  }

  // UI state
  let validationErrors = $state<Record<string, string>>({});

  // Update form data when repo changes
  $effect(() => {
    if (repo && repo.repoEvent && !isEditing) {
      formData = extractCurrentValues();
    }
  });

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};

    // Repository name validation
    if (!formData.name.trim()) {
      errors.name = "Repository name is required";
    } else if (formData.name.length < 1 || formData.name.length > 100) {
      errors.name = "Repository name must be between 1 and 100 characters";
    } else if (!/^[a-zA-Z0-9._-]+$/.test(formData.name)) {
      errors.name =
        "Repository name can only contain letters, numbers, dots, hyphens, and underscores";
    }

    // Description validation
    if (formData.description.length > 500) {
      errors.description = "Description must be 500 characters or less";
    }

    // Default branch validation
    if (!formData.defaultBranch.trim()) {
      errors.defaultBranch = "Default branch is required";
    } else if (!/^[a-zA-Z0-9._/-]+$/.test(formData.defaultBranch)) {
      errors.defaultBranch = "Invalid branch name format";
    }

    // Maintainers validation (accept npub or 64-char hex)
    const invalidMaintainers = formData.maintainers.filter((m) => {
      const v = m.trim();
      if (!v) return false;
      return !/^npub1[ac-hj-np-z02-9]{58}$/.test(v) && !/^[a-fA-F0-9]{64}$/.test(v);
    });
    if (invalidMaintainers.length > 0) {
      errors.maintainers = "Maintainers must be npub or 64-char hex pubkeys";
    }

    // Relays validation (wss:// URLs)
    const invalidRelays = formData.relays.filter(r => r.trim() && !r.match(/^wss?:\/\/.+/));
    if (invalidRelays.length > 0) {
      errors.relays = "Relays must be valid WebSocket URLs (wss://...)";
    }

    // Web URLs validation
    const invalidWebUrls = formData.webUrls.filter(w => w.trim() && !w.match(/^https?:\/\/.+/));
    if (invalidWebUrls.length > 0) {
      errors.webUrls = "Web URLs must be valid HTTP/HTTPS URLs";
    }

    // Clone URLs validation
    const invalidCloneUrls = formData.cloneUrls.filter(c => c.trim() && !c.match(/^(https?:\/\/|git@).+/));
    if (invalidCloneUrls.length > 0) {
      errors.cloneUrls = "Clone URLs must be valid git URLs (https:// or git@...)";
    }

    // Hashtags validation (no spaces, alphanumeric + hyphens)
    const invalidHashtags = formData.hashtags.filter(h => h.trim() && !h.match(/^[a-zA-Z0-9-]+$/));
    if (invalidHashtags.length > 0) {
      errors.hashtags = "Hashtags can only contain letters, numbers, and hyphens";
    }

    // Earliest unique commit validation (40-character hex)
    if (formData.earliestUniqueCommit.trim() && !formData.earliestUniqueCommit.match(/^[a-f0-9]{40}$/)) {
      errors.earliestUniqueCommit = "Must be a valid 40-character commit hash";
    }

    return errors;
  }

  // Validate form on input
  $effect(() => {
    validationErrors = validateForm();
  });


  const back = () => history.back();

  function handleCancel() {
    if (!isEditing) {
      back();
    }
  }

  // Keyboard navigation support
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !isEditing) {
      event.preventDefault();
      back();
    }
  }

  // Focus management
  let dialogElement = $state<HTMLDivElement>();
  $effect(() => {
    if (dialogElement) {
      // Focus the first focusable element when dialog opens
      const firstFocusable = dialogElement.querySelector(
        'input, textarea, button, [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  });

  async function handleSave() {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      validationErrors = errors;
      return;
    }

    try {
      // Filter out empty strings from arrays
      const cleanMaintainers = formData.maintainers.filter(m => m.trim());
      // Normalize maintainers to hex pubkeys
      const normalizedMaintainers = cleanMaintainers.map((m) => {
        const v = m.trim();
        if (/^npub1/i.test(v)) {
          try {
            const dec = nip19.decode(v);
            if (dec.type === "npub" && typeof dec.data === "string") {
              return dec.data.toLowerCase();
            }
          } catch (e) {
            // Fallback: keep original, validation should have caught invalid values
          }
        }
        return v.toLowerCase();
      });
      const cleanRelays = formData.relays.filter(r => r.trim());
      const cleanWebUrls = formData.webUrls.filter(w => w.trim());
      const cleanCloneUrls = formData.cloneUrls.filter(c => c.trim());
      const cleanHashtags = formData.hashtags.filter(h => h.trim());

      // Create updated repository announcement event using all NIP-34 fields
      const updatedAnnouncementEvent = repo.createRepoAnnouncementEvent({
        name: formData.name,
        description: formData.description,
        cloneUrl: cleanCloneUrls[0], // Primary clone URL
        webUrl: cleanWebUrls[0], // Primary web URL
        defaultBranch: formData.defaultBranch,
        maintainers: normalizedMaintainers,
        relays: cleanRelays,
        hashtags: cleanHashtags,
        earliestUniqueCommit: formData.earliestUniqueCommit.trim() || undefined,
        // Include all URLs in the event
        web: cleanWebUrls,
        clone: cleanCloneUrls,
      });

      // Create updated repository state event using existing repo state
      // Convert ProcessedBranch[] to string[] for branch names
      const branchNames = repo.branches?.map((branch) => branch.name) || [];

      // Convert repo.state.refs to the expected format if available
      const refs =
        repo.state?.refs?.map((ref) => ({
          type: ref.ref.startsWith("refs/heads/") ? ("heads" as const) : ("tags" as const),
          name: ref.ref.replace(/^refs\/(heads|tags)\//, ""),
          commit: ref.commit,
          ancestry: ref.lineage,
        })) || [];

      const updatedStateEvent = repo.createRepoStateEvent({
        repositoryId: repo.canonicalKey,
        headBranch: formData.defaultBranch,
        branches: branchNames,
        refs: refs,
      });

      // Sign and publish the events
      await onPublishEvent(updatedAnnouncementEvent);
      await onPublishEvent(updatedStateEvent);

      back();
    } catch (error) {
      console.error("Failed to save repository changes:", error);
    }
  }

  function handleRetry() {
    if (error && !isEditing) {
      handleSave();
    }
  }

  // Prevent panel close when editing
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !isEditing) {
      back();
    }
  }

  // Check if form has changes
  const isFormDirty = $derived.by(() => {
    const original = extractCurrentValues();

    // Normalize arrays by trimming empties for fair comparison (handleSave filters them out)
    const norm = (arr: string[]) => arr.filter((v) => v.trim());

    const basicChanged = (
      formData.name !== original.name ||
      formData.description !== original.description ||
      formData.visibility !== original.visibility ||
      formData.defaultBranch !== original.defaultBranch ||
      formData.earliestUniqueCommit !== original.earliestUniqueCommit
    );

    const arraysChanged = (
      JSON.stringify(norm(formData.maintainers)) !== JSON.stringify(norm(original.maintainers)) ||
      JSON.stringify(norm(formData.relays)) !== JSON.stringify(norm(original.relays)) ||
      JSON.stringify(norm(formData.webUrls)) !== JSON.stringify(norm(original.webUrls)) ||
      JSON.stringify(norm(formData.cloneUrls)) !== JSON.stringify(norm(original.cloneUrls)) ||
      JSON.stringify(norm(formData.hashtags)) !== JSON.stringify(norm(original.hashtags))
    );

    return basicChanged || arraysChanged;
  });

  // Check if form is valid
  const isFormValid = $derived.by(() => Object.keys(validationErrors).length === 0);
</script>

<!-- Edit Repository Panel -->
<div
  class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 outline-none isolate"
  role="dialog"
  aria-modal="true"
  aria-labelledby="edit-repo-title"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  tabindex={0}
>
  <div
    bind:this={dialogElement}
    class="bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] border border-gray-700 flex flex-col overflow-hidden relative z-[60]"
    role="document"
  >
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-gray-700">
      <div class="flex items-center space-x-3">
        <Settings class="w-6 h-6 text-blue-400" />
        <h2 id="edit-repo-title" class="text-xl font-semibold text-white">Edit Repository</h2>
      </div>
      {#if !isEditing}
        <button
          onclick={handleCancel}
          class="text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Close panel"
        >
          <X class="w-5 h-5" />
        </button>
      {/if}
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div class="p-6 space-y-6">
        <!-- Repository Metadata -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Repository Name -->
          <div>
            <label for="repo-name" class="block text-sm font-medium text-gray-300 mb-2">
              Repository name *
            </label>
            <input
              id="repo-name"
              type="text"
              bind:value={formData.name}
              disabled={isEditing}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              class:border-red-500={validationErrors.name}
              placeholder="Enter repository name"
              aria-describedby={validationErrors.name ? "repo-name-error" : undefined}
              aria-invalid={validationErrors.name ? "true" : "false"}
              required
            />
            {#if validationErrors.name}
              <p
                id="repo-name-error"
                class="text-red-400 text-sm mt-1 flex items-center space-x-1"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle class="w-4 h-4" />
                <span>{validationErrors.name}</span>
              </p>
            {/if}
          </div>
        </div>

        <!-- Description -->
        <div>
          <label for="repo-description" class="block text-sm font-medium text-gray-300 mb-2">
            Description
          </label>
          <textarea
            id="repo-description"
            bind:value={formData.description}
            disabled={isEditing}
            rows="3"
            class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            class:border-red-500={validationErrors.description}
            placeholder="Enter repository description"
            aria-describedby={validationErrors.description ? "repo-description-error" : undefined}
            aria-invalid={validationErrors.description ? "true" : "false"}
          ></textarea>
          {#if validationErrors.description}
            <p
              id="repo-description-error"
              class="text-red-400 text-sm mt-1 flex items-center space-x-1"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.description}</span>
            </p>
          {/if}
        </div>

        <!-- Default Branch -->
        <div>
          <label for="default-branch" class="block text-sm font-medium text-gray-300 mb-2">
            <GitBranch class="w-4 h-4 inline mr-1" />
            Default branch *
          </label>
          {#if !loadingRefs && availableBranches.length > 0}
            <!-- Dropdown menu for existing branches -->
            <select
              id="default-branch"
              bind:value={formData.defaultBranch}
              disabled={isEditing}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              class:border-red-500={validationErrors.defaultBranch}
              aria-describedby={validationErrors.defaultBranch ? "default-branch-error" : undefined}
              aria-invalid={validationErrors.defaultBranch ? "true" : "false"}
              required
            >
              <option value="" disabled>Select a branch</option>
              {#each availableBranches as branch}
                <option value={branch.name}>
                  {branch.name}
                  {#if branch.name === repo.mainBranch || branch.fullRef === repo.mainBranch}
                    (current)
                  {/if}
                </option>
              {/each}
            </select>
          {:else if loadingRefs}
            <!-- Loading state -->
            <div class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-400 flex items-center space-x-2">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span>Loading branches...</span>
            </div>
          {:else}
            <!-- Fallback text input when no branches are available -->
            <input
              id="default-branch"
              type="text"
              bind:value={formData.defaultBranch}
              disabled={isEditing}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              class:border-red-500={validationErrors.defaultBranch}
              placeholder="main"
              aria-describedby={validationErrors.defaultBranch ? "default-branch-error" : undefined}
              aria-invalid={validationErrors.defaultBranch ? "true" : "false"}
              required
            />
            <p class="text-gray-400 text-xs mt-1">
              No branches loaded. Enter branch name manually.
            </p>
          {/if}
          {#if validationErrors.defaultBranch}
            <p
              id="default-branch-error"
              class="text-red-400 text-sm mt-1 flex items-center space-x-1"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.defaultBranch}</span>
            </p>
          {/if}
        </div>

        <!-- Maintainers -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            <Users class="w-4 h-4 inline mr-1" />
            Maintainers
          </label>
          <div class="space-y-2">
            {#each formData.maintainers as maintainer, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  bind:value={formData.maintainers[index]}
                  oninput={(e) => updateArrayItem('maintainers', index, (e.target as HTMLInputElement).value)}
                  disabled={isEditing}
                  class="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="npub1..."
                />
                <button
                  type="button"
                  onclick={() => removeArrayItem('maintainers', index)}
                  disabled={isEditing}
                  class="p-2 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Remove maintainer"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            {/each}
            <button
              type="button"
              onclick={() => addArrayItem('maintainers')}
              disabled={isEditing}
              class="flex items-center space-x-2 px-3 py-2 text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-4 h-4" />
              <span>Add maintainer</span>
            </button>
          </div>
          {#if validationErrors.maintainers}
            <p class="text-red-400 text-sm mt-1 flex items-center space-x-1" role="alert" aria-live="polite">
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.maintainers}</span>
            </p>
          {/if}
        </div>

        <!-- Relays -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            <Globe class="w-4 h-4 inline mr-1" />
            Relays
          </label>
          <div class="space-y-2">
            {#each formData.relays as relay, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  bind:value={formData.relays[index]}
                  oninput={(e) => updateArrayItem('relays', index, (e.target as HTMLInputElement).value)}
                  disabled={isEditing}
                  class="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="wss://relay.example.com"
                />
                <button
                  type="button"
                  onclick={() => removeArrayItem('relays', index)}
                  disabled={isEditing}
                  class="p-2 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Remove relay"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            {/each}
            <button
              type="button"
              onclick={() => addArrayItem('relays')}
              disabled={isEditing}
              class="flex items-center space-x-2 px-3 py-2 text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-4 h-4" />
              <span>Add relay</span>
            </button>
          </div>
          {#if validationErrors.relays}
            <p class="text-red-400 text-sm mt-1 flex items-center space-x-1" role="alert" aria-live="polite">
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.relays}</span>
            </p>
          {/if}
        </div>

        <!-- Web URLs -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            <Globe class="w-4 h-4 inline mr-1" />
            Web URLs
          </label>
          <div class="space-y-2">
            {#each formData.webUrls as webUrl, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  bind:value={formData.webUrls[index]}
                  oninput={(e) => updateArrayItem('webUrls', index, (e.target as HTMLInputElement).value)}
                  disabled={isEditing}
                  class="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="https://github.com/user/repo"
                />
                <button
                  type="button"
                  onclick={() => removeArrayItem('webUrls', index)}
                  disabled={isEditing}
                  class="p-2 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Remove web URL"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            {/each}
            <button
              type="button"
              onclick={() => addArrayItem('webUrls')}
              disabled={isEditing}
              class="flex items-center space-x-2 px-3 py-2 text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-4 h-4" />
              <span>Add web URL</span>
            </button>
          </div>
          {#if validationErrors.webUrls}
            <p class="text-red-400 text-sm mt-1 flex items-center space-x-1" role="alert" aria-live="polite">
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.webUrls}</span>
            </p>
          {/if}
        </div>

        <!-- Clone URLs -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            <Link class="w-4 h-4 inline mr-1" />
            Clone URLs
          </label>
          <div class="space-y-2">
            {#each formData.cloneUrls as cloneUrl, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  bind:value={formData.cloneUrls[index]}
                  oninput={(e) => updateArrayItem('cloneUrls', index, (e.target as HTMLInputElement).value)}
                  disabled={isEditing}
                  class="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="https://github.com/user/repo.git"
                />
                <button
                  type="button"
                  onclick={() => removeArrayItem('cloneUrls', index)}
                  disabled={isEditing}
                  class="p-2 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Remove clone URL"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            {/each}
            <button
              type="button"
              onclick={() => addArrayItem('cloneUrls')}
              disabled={isEditing}
              class="flex items-center space-x-2 px-3 py-2 text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-4 h-4" />
              <span>Add clone URL</span>
            </button>
          </div>
          {#if validationErrors.cloneUrls}
            <p class="text-red-400 text-sm mt-1 flex items-center space-x-1" role="alert" aria-live="polite">
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.cloneUrls}</span>
            </p>
          {/if}
        </div>

        <!-- Hashtags -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            <Hash class="w-4 h-4 inline mr-1" />
            Hashtags
          </label>
          <div class="space-y-2">
            {#each formData.hashtags as hashtag, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  bind:value={formData.hashtags[index]}
                  oninput={(e) => updateArrayItem('hashtags', index, (e.target as HTMLInputElement).value)}
                  disabled={isEditing}
                  class="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="javascript"
                />
                <button
                  type="button"
                  onclick={() => removeArrayItem('hashtags', index)}
                  disabled={isEditing}
                  class="p-2 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Remove hashtag"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            {/each}
            <button
              type="button"
              onclick={() => addArrayItem('hashtags')}
              disabled={isEditing}
              class="flex items-center space-x-2 px-3 py-2 text-blue-400 hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus class="w-4 h-4" />
              <span>Add hashtag</span>
            </button>
          </div>
          {#if validationErrors.hashtags}
            <p class="text-red-400 text-sm mt-1 flex items-center space-x-1" role="alert" aria-live="polite">
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.hashtags}</span>
            </p>
          {/if}
        </div>

        <!-- Earliest Unique Commit -->
        <div>
          <label for="earliest-commit" class="block text-sm font-medium text-gray-300 mb-2">
            <GitCommit class="w-4 h-4 inline mr-1" />
            Earliest Unique Commit
          </label>
          <input
            id="earliest-commit"
            type="text"
            bind:value={formData.earliestUniqueCommit}
            disabled={isEditing}
            class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
            class:border-red-500={validationErrors.earliestUniqueCommit}
            placeholder="40-character commit hash (optional)"
            aria-describedby={validationErrors.earliestUniqueCommit ? "earliest-commit-error" : undefined}
            aria-invalid={validationErrors.earliestUniqueCommit ? "true" : "false"}
          />
          {#if validationErrors.earliestUniqueCommit}
            <p
              id="earliest-commit-error"
              class="text-red-400 text-sm mt-1 flex items-center space-x-1"
              role="alert"
              aria-live="polite"
            >
              <AlertCircle class="w-4 h-4" />
              <span>{validationErrors.earliestUniqueCommit}</span>
            </p>
          {/if}
          <p class="text-gray-400 text-xs mt-1">
            The commit ID of the earliest unique commit to identify this repository among forks
          </p>
        </div>

        <!-- Progress Display -->
        {#if isEditing && progress}
          <div class="space-y-4">
            <div class="flex items-center space-x-3">
              {#if progress.isComplete}
                <CheckCircle2 class="w-5 h-5 text-green-400" />
                <span class="text-green-400 font-medium">Repository updated successfully!</span>
              {:else}
                <Loader2 class="w-5 h-5 text-blue-400 animate-spin" />
                <span class="text-white">{progress.stage}</span>
              {/if}
            </div>

            <!-- Progress Bar -->
            <div class="w-full bg-gray-700 rounded-full h-2">
              <div
                class="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style="width: {progress.percentage}%"
              ></div>
            </div>
            <div class="text-right text-sm text-gray-400">
              {Math.round(progress.percentage)}%
            </div>
          </div>
        {/if}

        <!-- Error Display -->
        {#if error}
          <div class="bg-red-900/50 border border-red-500 rounded-lg p-4">
            <div class="flex items-start space-x-3">
              <AlertCircle class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <h4 class="text-red-400 font-medium mb-1">Update Failed</h4>
                <p class="text-red-300 text-sm">{error}</p>
                {#if !isEditing}
                  <button
                    onclick={handleRetry}
                    class="mt-3 text-red-400 hover:text-red-300 text-sm underline"
                  >
                    Try again
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    {#if !progress?.isComplete}
      <div class="flex items-center justify-between p-6 border-t border-gray-700">
        <div class="text-sm text-gray-400">
          {#if isFormDirty}
            <span class="text-yellow-400">• Unsaved changes</span>
          {:else}
            <span>No changes</span>
          {/if}
        </div>
        <div class="flex items-center space-x-3">
          <button
            onclick={handleCancel}
            disabled={isEditing}
            class="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onclick={handleSave}
            disabled={isEditing || !isFormValid || !isFormDirty}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {#if isEditing}
              <Loader2 class="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            {:else}
              <Save class="w-4 h-4" />
              <span>Save Changes</span>
            {/if}
          </button>
        </div>
      </div>
    {:else}
      <div class="flex items-center justify-end p-6 border-t border-gray-700">
        <button
          onclick={back}
          class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2"
        >
          <CheckCircle2 class="w-4 h-4" />
          <span>Done</span>
        </button>
      </div>
    {/if}
  </div>
</div>
