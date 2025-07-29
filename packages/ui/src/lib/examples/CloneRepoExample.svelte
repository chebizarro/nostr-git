<script lang="ts">
  import { CloneRepoDialog } from '../components/git/CloneRepoDialog.svelte';
  import { useCloneRepo } from '../hooks/useCloneRepo.svelte.ts';
  import type { Event } from 'nostr-tools';

  // Example of how to integrate the Clone Repository feature
  let showCloneDialog = $state(false);

  // Initialize the clone repository hook
  const cloneRepo = useCloneRepo();

  // Example event signing closure (would be provided by parent app)
  const signEvent = async (event: Partial<Event>): Promise<Event> => {
    // This would use the app's signer (NIP-07, NIP-46, etc.)
    console.log('Signing event:', event);
    
    // Mock implementation - replace with actual signing logic
    return {
      ...event,
      id: 'mock-event-id',
      pubkey: 'mock-pubkey',
      sig: 'mock-signature',
      created_at: Math.floor(Date.now() / 1000),
    } as Event;
  };

  // Example event publishing closure (would be provided by parent app)
  const publishEvent = async (event: Event): Promise<void> => {
    // This would publish to the app's configured relays
    console.log('Publishing event:', event);
    
    // Mock implementation - replace with actual publishing logic
    // await pool.publish(relays, event);
  };

  // Example repository registration closure (would be provided by parent app)
  const registerRepo = async (repoId: string, cloneUrl: string): Promise<void> => {
    // This would add the cloned repo to the app's global store/state
    console.log('Registering cloned repository:', { repoId, cloneUrl });
    
    // Mock implementation - replace with actual store integration
    // await repoStore.addRepository({ id: repoId, cloneUrl, ... });
  };

  function handleOpenCloneDialog() {
    showCloneDialog = true;
  }

  function handleCloseCloneDialog() {
    showCloneDialog = false;
    cloneRepo.reset();
  }

  async function handleCloneRepo(config: any) {
    try {
      await cloneRepo.cloneRepository(config);
      
      // Dialog will close automatically on success
      showCloneDialog = false;
    } catch (error) {
      console.error('Clone failed:', error);
      // Error is handled by the dialog component
    }
  }
</script>

<!-- Example usage of Clone Repository feature -->
<div class="p-6 space-y-4">
  <h2 class="text-2xl font-bold text-white">Clone Repository Example</h2>
  
  <p class="text-gray-300">
    This example demonstrates how to integrate the Clone Repository feature
    with your application's event signing, publishing, and repository management.
  </p>

  <!-- Clone Repository Button -->
  <button
    onclick={handleOpenCloneDialog}
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
  >
    Clone Repository
  </button>

  <!-- Clone Repository Dialog -->
  {#if showCloneDialog}
    <CloneRepoDialog
      isOpen={showCloneDialog}
      onClose={handleCloseCloneDialog}
      onClone={handleCloneRepo}
      signEvent={signEvent}
      publishEvent={publishEvent}
      registerRepo={registerRepo}
      progress={cloneRepo.progress}
      error={cloneRepo.error}
      isCloning={cloneRepo.isCloning}
    />
  {/if}

  <!-- Status Display -->
  {#if cloneRepo.progress}
    <div class="mt-4 p-4 bg-gray-800 rounded-lg">
      <h3 class="text-lg font-semibold text-white mb-2">Clone Status</h3>
      <p class="text-gray-300">{cloneRepo.progress.message}</p>
      <div class="w-full bg-gray-700 rounded-full h-2 mt-2">
        <div 
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style="width: {cloneRepo.progress.percentage}%"
        ></div>
      </div>
    </div>
  {/if}

  {#if cloneRepo.error}
    <div class="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
      <h3 class="text-lg font-semibold text-red-400 mb-2">Clone Error</h3>
      <p class="text-red-300">{cloneRepo.error}</p>
    </div>
  {/if}
</div>

<style>
  /* Additional styles can be added here if needed */
</style>
