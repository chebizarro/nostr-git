<script lang="ts">
  import { X, GitFork, AlertCircle, CheckCircle2, Loader2 } from '@lucide/svelte';
  import { Repo } from './Repo.svelte';
  import { useForkRepo } from '../../hooks/useForkRepo.svelte';
  import type { RepoAnnouncementEvent, RepoStateEvent } from '@nostr-git/shared-types';

  // Component props
  interface Props {
    repo: Repo;
    onPublishEvent: (event: RepoAnnouncementEvent | RepoStateEvent) => Promise<void>;
  }

  const {
    repo,
    onPublishEvent
  }: Props = $props();

  // Initialize the useForkRepo hook
  const forkState = useForkRepo({
    onProgress: (steps) => {
      // Progress is handled internally by the hook
      console.log('🔄 Fork progress:', steps);
    },
    onForkCompleted: (result) => {
      console.log('🎉 Fork completed:', result);
      handleClose();
    },
    onPublishEvent: onPublishEvent
  });
  
  // Access reactive state through getters
  const progress = $derived(forkState.progress);
  const error = $derived(forkState.error);
  const isForking = $derived(forkState.isForking);

  // Extract repository information from Repo instance
  const repoData = repo.repo;
  const cloneUrl = repoData?.clone?.[0] || '';
  let isOpen = $state(true);

  // Parse owner and repo name from clone URL
  const urlMatch = cloneUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?/);
  const originalRepo = {
    owner: urlMatch?.[1] || 'unknown',
    name: urlMatch?.[2] || 'repository',
    description: repoData?.description || ''
  };
    // Form state
  let forkName = $state(`${originalRepo.name}-fork`);

  // Debug initial state
  console.log('🏁 ForkRepoDialog: Initial state', { 
    originalRepo 
  });

  // Computed properties
  const progressLength = $derived(progress?.length || 0);
  

  
  // UI state
  let validationError = $state<string | undefined>();

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

  // Computed properties for progress handling
  const isProgressComplete = $derived.by(() => {
    // If no progress or empty progress array, fork hasn't started yet
    if (!progress || progress.length === 0) return false;
    // Only complete if we have progress steps AND all are completed
    const result = progress.length > 0 && progress.every(step => step.status === 'completed');
    console.log('🔍 ForkRepoDialog: isProgressComplete =', result, { progress, progressLength: progress?.length });
    return result;
  });

  const currentProgressMessage = $derived.by(() => {
    if (!progress || progress.length === 0) return '';
    const runningStep = progress.find(step => step.status === 'running');
    if (runningStep) return runningStep.message;
    const lastStep = progress[progress.length - 1];
    return lastStep?.message || '';
  });

  function handleClose() {
    console.log('🔄 ForkRepoDialog: handleClose called', { isForking, isOpen });
    if (!isForking) {
      console.log('✅ ForkRepoDialog: Closing dialog - setting isOpen to false and navigating back');
      isOpen = false;
      // Use browser history API to go back (framework-agnostic)
      window.history.back();
    } else {
      console.log('⚠️ ForkRepoDialog: Cannot close - fork operation in progress');
    }
  }

  async function handleFork() {
    console.log('🚀 ForkRepoDialog: handleFork called', { forkName, originalRepo });
    
    const nameError = validateForkName(forkName);
    if (nameError) {
      console.log('❌ ForkRepoDialog: Validation error:', nameError);
      validationError = nameError;
      return;
    }

    console.log('✅ ForkRepoDialog: Validation passed, calling forkRepository');
    try {
      const result = await forkState.forkRepository(originalRepo, {
        forkName: forkName.trim()
      });
      console.log('🎉 ForkRepoDialog: forkRepository completed', result);
    } catch (error) {
      console.error('💥 ForkRepoDialog: Fork failed:', error);
      // Error is handled by the useForkRepo hook
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
      handleClose();
    }
  }

  // Handle keyboard events for accessibility
  function handleBackdropKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !isForking) {
      handleClose();
    }
  }


</script>

<!-- Fork Repository Dialog -->
{#if isOpen}
  <div 
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="fork-dialog-title"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleBackdropKeydown}
  >
    <div class="bg-gray-900 rounded-lg shadow-xl w-full max-w-md border border-gray-700">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-700">
        <div class="flex items-center space-x-3">
          <GitFork class="w-6 h-6 text-blue-400" />
          <h2 id="fork-dialog-title" class="text-xl font-semibold text-white">Fork Repository</h2>
        </div>
        {#if !isForking}
          <button
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
        <!-- Progress Display -->
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
                  {#if step.status === 'completed'}
                    <CheckCircle2 class="w-4 h-4 text-green-400" />
                    <span class="text-green-400">{step.message}</span>
                  {:else if step.status === 'running'}
                    <Loader2 class="w-4 h-4 text-blue-400 animate-spin" />
                    <span class="text-blue-400">{step.message}</span>
                  {:else if step.status === 'error'}
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
            onclick={handleClose}
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
            onclick={handleClose}
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
