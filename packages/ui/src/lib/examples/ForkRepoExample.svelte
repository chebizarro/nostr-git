<script lang="ts">
  import ForkRepoDialog from '../components/git/ForkRepoDialog.svelte';
  import { useForkRepo } from '../hooks/useForkRepo.svelte';
  import type { Event } from 'nostr-tools';

  // Example of how to integrate the Fork Repository feature
  let showForkDialog = $state(false);

  // Example original repository data
  const originalRepo = {
    owner: 'octocat',
    name: 'Hello-World',
    description: 'This your first repo!'
  };

  // Initialize the fork repository hook
  const forkRepo = useForkRepo();

  // Example event signing closure (would be provided by parent app)
  const signEvent = async (event: Partial<Event>): Promise<Event> => {
    // This would use the app's signer (NIP-07, NIP-46, etc.)
    console.log('Signing fork announcement event:', event);
    
    // Mock implementation - replace with actual signing logic
    return {
      ...event,
      id: 'mock-fork-event-id',
      pubkey: 'mock-user-pubkey',
      sig: 'mock-signature',
      created_at: Math.floor(Date.now() / 1000),
    } as Event;
  };

  // Example event publishing closure (would be provided by parent app)
  const publishEvent = async (event: Event): Promise<void> => {
    // This would publish to the app's configured relays
    console.log('Publishing fork announcement event:', event);
    
    // Mock implementation - replace with actual publishing logic
    // await pool.publish(relays, event);
  };

  // Example repository registration closure (would be provided by parent app)
  const registerRepo = async (repoId: string, forkUrl: string): Promise<void> => {
    // This would add the forked repo to the app's global store/state
    console.log('Registering forked repository:', { repoId, forkUrl });
    
    // Mock implementation - replace with actual store integration
    // await repoStore.addRepository({ id: repoId, forkUrl, type: 'fork', ... });
  };

  function handleOpenForkDialog() {
    showForkDialog = true;
  }

  function handleCloseForkDialog() {
    showForkDialog = false;
    forkRepo.reset();
  }

  async function handleForkRepo(config: any) {
    try {
      await forkRepo.forkRepository(
        originalRepo,
        config,
        {
          token: 'ghp_example_token_here', // Would come from token store
          currentUser: 'current-user', // Would come from user profile
          onSignEvent: signEvent,
          onPublishEvent: publishEvent,
          onRegisterRepo: registerRepo
        }
      );
      
      // Dialog will close automatically on success via progress.isComplete
      if (forkRepo.progress?.isComplete) {
        setTimeout(() => {
          showForkDialog = false;
        }, 2000); // Show success for 2 seconds
      }
    } catch (error) {
      console.error('Fork failed:', error);
      // Error is handled by the dialog component
    }
  }
</script>

<!-- Example usage of Fork Repository feature -->
<div class="p-6 space-y-4">
  <h2 class="text-2xl font-bold text-white">Fork Repository Example</h2>
  
  <p class="text-gray-300">
    This example demonstrates how to integrate the Fork Repository feature
    with your application's event signing, publishing, and repository management.
  </p>

  <!-- Original Repository Display -->
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-600">
    <h3 class="text-lg font-semibold text-white mb-2">Original Repository</h3>
    <div class="space-y-1">
      <p class="text-gray-300">
        <span class="font-medium">{originalRepo.owner}/{originalRepo.name}</span>
      </p>
      {#if originalRepo.description}
        <p class="text-gray-400 text-sm">{originalRepo.description}</p>
      {/if}
    </div>
  </div>

  <!-- Fork Repository Button -->
  <button
    onclick={handleOpenForkDialog}
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
    <span>Fork Repository</span>
  </button>

  <!-- Fork Repository Dialog -->
  {#if showForkDialog}
    <ForkRepoDialog
      isOpen={showForkDialog}
      {originalRepo}
      defaultForkName={originalRepo.name}
      onClose={handleCloseForkDialog}
      onFork={handleForkRepo}
      onSignEvent={signEvent}
      onPublishEvent={publishEvent}
      progress={forkRepo.progress}
      error={forkRepo.error}
      isForking={forkRepo.isForking}
    />
  {/if}

  <!-- Status Display -->
  {#if forkRepo.progress}
    <div class="mt-4 p-4 bg-gray-800 rounded-lg">
      <h3 class="text-lg font-semibold text-white mb-2">Fork Status</h3>
      <p class="text-gray-300">{forkRepo.progress.stage}</p>
      <div class="w-full bg-gray-700 rounded-full h-2 mt-2">
        <div 
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style="width: {forkRepo.progress.percentage}%"
        ></div>
      </div>
      <div class="text-right text-sm text-gray-400 mt-1">
        {Math.round(forkRepo.progress.percentage)}%
      </div>
    </div>
  {/if}

  {#if forkRepo.error}
    <div class="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
      <h3 class="text-lg font-semibold text-red-400 mb-2">Fork Error</h3>
      <p class="text-red-300">{forkRepo.error}</p>
    </div>
  {/if}

  <!-- Integration Notes -->
  <div class="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
    <h3 class="text-lg font-semibold text-blue-400 mb-2">Integration Notes</h3>
    <ul class="text-blue-300 text-sm space-y-1">
      <li>• Replace mock signing/publishing with actual Nostr signer integration</li>
      <li>• Connect to real Git token store for authentication</li>
      <li>• Integrate with global repository store for fork registration</li>
      <li>• Add navigation to forked repository after completion</li>
      <li>• Implement proper error handling and user feedback</li>
    </ul>
  </div>
</div>

<style>
  /* Additional styles can be added here if needed */
</style>
