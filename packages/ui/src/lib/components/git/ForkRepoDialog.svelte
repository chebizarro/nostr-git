<script lang="ts">
  import { X, GitFork, Eye, EyeOff, AlertCircle, CheckCircle2, Loader2 } from 'lucide-svelte';
  import type { Event } from 'nostr-tools';

  // Types for fork configuration and progress
  interface OriginalRepo {
    owner: string;
    name: string;
    description?: string;
  }

  interface ForkProgress {
    stage: string;
    percentage: number;
    isComplete: boolean;
  }

  interface ForkConfig {
    forkName: string;
    visibility: 'public' | 'private';
  }

  // Component props
  interface Props {
    isOpen: boolean;
    originalRepo: OriginalRepo;
    defaultForkName: string;
    onClose: () => void;
    onFork: (config: ForkConfig) => Promise<void>;
    onSignEvent: (event: Partial<Event>) => Promise<Event>;
    onPublishEvent: (event: Event) => Promise<void>;
    progress?: ForkProgress;
    error?: string;
    isForking?: boolean;
  }

  const {
    isOpen,
    originalRepo,
    defaultForkName,
    onClose,
    onFork,
    onSignEvent,
    onPublishEvent,
    progress,
    error,
    isForking = false
  }: Props = $props();

  // Form state
  let forkName = $state(defaultForkName);
  let visibility = $state<'public' | 'private'>('public');
  
  // UI state
  let validationError = $state<string | undefined>();

  // Auto-update fork name when default changes
  $effect(() => {
    if (defaultForkName && !isForking) {
      forkName = defaultForkName;
    }
  });

  function validateForkName(name: string): string | undefined {
    if (!name.trim()) {
      return 'Fork name is required';
    }
    
    if (name.length < 1 || name.length > 100) {
      return 'Fork name must be between 1 and 100 characters';
    }
    
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return 'Fork name can only contain letters, numbers, dots, hyphens, and underscores';
    }
    
    return undefined;
  }

  // Validate fork name on input
  $effect(() => {
    validationError = validateForkName(forkName);
  });

  function handleCancel() {
    if (!isForking) {
      onClose();
    }
  }

  async function handleFork() {
    const nameError = validateForkName(forkName);
    if (nameError) {
      validationError = nameError;
      return;
    }

    try {
      await onFork({
        forkName: forkName.trim(),
        visibility
      });
    } catch (error) {
      console.error('Fork failed:', error);
      // Error handling is managed by parent component
    }
  }

  function handleRetry() {
    if (error && !isForking) {
      handleFork();
    }
  }

  // Prevent dialog close when forking
  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !isForking) {
      onClose();
    }
  }
</script>

<!-- Fork Repository Dialog -->
{#if isOpen}
  <div 
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={handleBackdropClick}
  >
    <div class="bg-gray-900 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-700">
        <div class="flex items-center space-x-3">
          <GitFork class="w-6 h-6 text-blue-400" />
          <h2 class="text-xl font-semibold text-white">Fork Repository</h2>
        </div>
        {#if !isForking}
          <button
            onclick={handleCancel}
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
        {#if !isForking || !progress?.isComplete}
          <div class="space-y-4">
            <!-- Fork Name -->
            <div>
              <label for="fork-name" class="block text-sm font-medium text-gray-300 mb-2">
                Repository name *
              </label>
              <input
                id="fork-name"
                type="text"
                bind:value={forkName}
                disabled={isForking}
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter fork name"
              />
              {#if validationError}
                <p class="text-red-400 text-sm mt-1 flex items-center space-x-1">
                  <AlertCircle class="w-4 h-4" />
                  <span>{validationError}</span>
                </p>
              {/if}
            </div>

            <!-- Visibility -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Visibility
              </label>
              <div class="space-y-2">
                <label class="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    bind:group={visibility}
                    value="public"
                    disabled={isForking}
                    class="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div class="flex items-center space-x-2">
                    <Eye class="w-4 h-4 text-gray-400" />
                    <span class="text-white">Public</span>
                  </div>
                  <span class="text-gray-400 text-sm">Anyone can see this repository</span>
                </label>
                <label class="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    bind:group={visibility}
                    value="private"
                    disabled={isForking}
                    class="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div class="flex items-center space-x-2">
                    <EyeOff class="w-4 h-4 text-gray-400" />
                    <span class="text-white">Private</span>
                  </div>
                  <span class="text-gray-400 text-sm">Only you can see this repository</span>
                </label>
              </div>
            </div>
          </div>
        {/if}

        <!-- Progress Display -->
        {#if isForking && progress}
          <div class="space-y-4">
            <div class="flex items-center space-x-3">
              {#if progress.isComplete}
                <CheckCircle2 class="w-5 h-5 text-green-400" />
                <span class="text-green-400 font-medium">Fork completed successfully!</span>
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
                <h4 class="text-red-400 font-medium mb-1">Fork Failed</h4>
                <p class="text-red-300 text-sm">{error}</p>
                {#if !isForking}
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

      <!-- Footer -->
      {#if !progress?.isComplete}
        <div class="flex items-center justify-end space-x-3 p-6 border-t border-gray-700">
          <button
            onclick={handleCancel}
            disabled={isForking}
            class="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onclick={handleFork}
            disabled={isForking || !!validationError || !forkName.trim()}
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
        <div class="flex items-center justify-end p-6 border-t border-gray-700">
          <button
            onclick={onClose}
            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            <CheckCircle2 class="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Additional styles for radio buttons */
  input[type="radio"]:checked {
    background-color: #3b82f6;
    border-color: #3b82f6;
  }
</style>
