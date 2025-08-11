<script lang="ts">
  import { X, GitFork, AlertCircle, CheckCircle2, Loader2, ChevronDown, ExternalLink } from '@lucide/svelte';
  import { Repo } from './Repo.svelte';
  import { useForkRepo } from '../../hooks/useForkRepo.svelte';
  import { tokens } from '../../stores/tokens.js';
  import type { RepoAnnouncementEvent, RepoStateEvent } from '@nostr-git/shared-types';
  import type { Token } from '../../stores/tokens.js';
  import { getGitServiceApi } from '@nostr-git/core';
  import { toast } from '$lib/stores/toast';

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
  let selectedService = $state<string>('github.com'); // Default to GitHub
  let isCheckingExistingFork = $state(false);
  let existingForkInfo = $state<{ exists: boolean; url?: string; message?: string; service?: string; error?: string } | null>(null);
  // GRASP-specific state
  let relayUrl = $state('');
  let relayUrlError = $state<string | undefined>();

  // Get available git services from tokens
  let tokenList = $state<Token[]>([]);
  tokens.subscribe((t) => {
    tokenList = t;
  });

  const availableServices = $derived.by(() => {
    const services = tokenList
      .filter(token => ['github.com', 'gitlab.com', 'bitbucket.org'].includes(token.host))
      .map(token => ({
        host: token.host,
        label: token.host === 'github.com' ? 'GitHub' : 
               token.host === 'gitlab.com' ? 'GitLab' : 
               token.host === 'bitbucket.org' ? 'Bitbucket' : token.host
      }));

    // Always include GRASP option regardless of tokens
    services.push({ host: 'grasp', label: 'GRASP (Nostr)' });
    
    // Ensure selected service is available, fallback to GitHub or GRASP
    if (!services.some(s => s.host === selectedService)) {
      selectedService = services.find(s => s.host === 'github.com')?.host || 'grasp';
    }
    
    return services;
  });

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

  // Debounced fork checking to prevent excessive API calls
  let checkTimeout: ReturnType<typeof setTimeout> | undefined;
  let lastCheckedKey = $state<string>('');

  // Check for existing fork when service or fork name changes (debounced)
  $effect(() => {
    const currentKey = `${selectedService}:${forkName.trim()}`;
    
    // Clear existing timeout
    if (checkTimeout) {
      clearTimeout(checkTimeout);
    }
    
    // Skip if we already checked this combination
    if (currentKey === lastCheckedKey || !selectedService || !forkName.trim() || availableServices.length === 0) {
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
    if (selectedService === 'grasp') {
      existingForkInfo = { exists: false, service: 'grasp', message: 'Fork existence check is not applicable for GRASP.' };
      lastCheckedKey = checkKey;
      return;
    }

    isCheckingExistingFork = true;
    existingForkInfo = null;

    try {
      const token = tokenList.find(t => t.host === selectedService)?.token;
      if (!token) {
        existingForkInfo = {
          exists: false,
          message: `No token found for ${selectedService}`
        };
        return;
      }

      // Check if fork exists based on service
      if (selectedService === 'github.com') {
        // Get current user info and check if fork already exists
        const api = getGitServiceApi('github', token);
        const userData = await api.getCurrentUser();
        const username = userData.login;
        
        // Check if fork already exists
        try {
          await api.getRepo(username, forkName);
          // Fork exists
          toast.push({
            message: `Fork '${forkName}' already exists in your GitHub account`,
            theme: 'error'
          });
          return;
        } catch (error: any) {
          // Fork doesn't exist (good!) - continue with fork creation
          if (!error.message?.includes('404') && !error.message?.includes('Not Found')) {
            // Some other error occurred
            throw error;
          }
        }

        // Repository check is already done above - fork doesn't exist, so we can proceed
        existingForkInfo = {
          exists: false,
          service: selectedService
        };
      } else {
        // For other services, show placeholder
        existingForkInfo = {
          exists: false,
          service: selectedService,
          message: `Fork checking not yet implemented for ${selectedService}`
        };
      }
      
      // Mark this combination as checked to prevent redundant calls
      lastCheckedKey = checkKey;
    } catch (error) {
      console.error('Error checking existing fork:', error);
      existingForkInfo = {
        exists: false,
        service: selectedService,
        error: error instanceof Error ? error.message : 'Unknown error'
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
    if (selectedService !== 'grasp') {
      relayUrlError = undefined;
    }
  }

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
    console.log('🚀 ForkRepoDialog: handleFork called', { forkName, originalRepo, selectedService });
    
    // Validate service availability
    if (availableServices.length === 0) {
      console.log('❌ ForkRepoDialog: No git services available');
      return;
    }

    // Check if fork already exists
    if (existingForkInfo?.exists) {
      console.log('❌ ForkRepoDialog: Fork already exists');
      return;
    }
    
    const nameError = validateForkName(forkName);
    if (nameError) {
      console.log('❌ ForkRepoDialog: Validation error:', nameError);
      validationError = nameError;
      return;
    }

    console.log('🚀 ForkRepoDialog: Starting fork operation with config:', {
      forkName,
      selectedService,
      visibility: 'public'
    });

    try {
      // All services are now supported via GitServiceApi abstraction
      console.log('🚀 ForkRepoDialog: Fork operation supported for service:', selectedService);

      // Validate relay URL when GRASP is selected
      let relayParam: string | undefined = undefined;
      if (selectedService === 'grasp') {
        const val = relayUrl.trim();
        if (!val) {
          relayUrlError = 'Relay URL is required for GRASP';
          return;
        }
        const ok = /^wss?:\/\//i.test(val);
        if (!ok) {
          relayUrlError = 'Invalid relay URL. Must start with ws:// or wss://';
          return;
        }
        relayUrlError = undefined;
        relayParam = val;
      }

      const result = await forkState.forkRepository(originalRepo, {
        forkName,
        visibility: 'public',
        provider: selectedService === 'github.com' ? 'github' : 
                 selectedService === 'gitlab.com' ? 'gitlab' :
                 selectedService === 'gitea.com' ? 'gitea' :
                 selectedService === 'bitbucket.org' ? 'bitbucket' :
                 selectedService === 'grasp' ? 'grasp' : 'github',
        relayUrl: relayParam
      });
      
      if (result) {
        console.log('✅ ForkRepoDialog: Fork completed successfully:', result);
      }
    } catch (error) {
      console.error('❌ ForkRepoDialog: Fork failed:', error);
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
                  <ChevronDown class="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <p class="mt-1 text-xs text-gray-400">
                  Fork will be created on {availableServices.find(s => s.host === selectedService)?.label || selectedService}
                </p>
              </div>
              {#if selectedService === 'grasp'}
                <div>
                  <label for="relay-url" class="block text-sm font-medium text-gray-300 mb-2">
                    GRASP Relay URL (ws:// or wss://) *
                  </label>
                  <input
                    id="relay-url"
                    type="text"
                    bind:value={relayUrl}
                    placeholder="wss://relay.example.com"
                    class="w-full px-3 py-2 bg-gray-800 border {relayUrlError ? 'border-red-500' : 'border-gray-600'} rounded-lg text-white focus:outline-none focus:ring-2 {relayUrlError ? 'focus:ring-red-500' : 'focus:ring-blue-500'} focus:border-transparent"
                  />
                  {#if relayUrlError}
                    <p class="mt-1 text-sm text-red-400 flex items-center gap-1"><AlertCircle class="w-4 h-4" /> {relayUrlError}</p>
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
                      You need to add authentication tokens for git services (GitHub, GitLab, etc.) to fork repositories.
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
                placeholder="Enter fork name"
                disabled={availableServices.length === 0}
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {#if validationError}
                <p class="mt-1 text-sm text-red-400 flex items-center space-x-1">
                  <AlertCircle class="w-4 h-4" />
                  <span>{validationError}</span>
                </p>
              {/if}
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
            disabled={isForking || !!validationError || !forkName.trim() || availableServices.length === 0 || existingForkInfo?.exists}
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
