<script lang="ts">
  import { EditRepoPanel } from "../components/git/EditRepoPanel.svelte";
  import { useEditRepo } from "../hooks/useEditRepo.svelte.ts";
  import type { Event } from "nostr-tools";
  import type { RepoAnnouncementEvent, RepoStateEvent } from "@nostr-git/shared-types";
  import { getTagValue } from "@nostr-git/shared-types";

  // Example of how to integrate the Edit Repository feature
  let showEditPanel = $state(false);

  // Example current repository events (would come from Nostr subscriptions)
  const currentAnnouncement: RepoAnnouncementEvent = {
    kind: 30617,
    id: "mock-announcement-id",
    pubkey: "mock-pubkey",
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    sig: "mock-signature",
    tags: [
      ["d", "example-repo"],
      ["name", "Example Repository"],
      ["description", "An example repository for testing"],
      ["clone", "https://github.com/octocat/example-repo.git"],
      ["web", "https://github.com/octocat/example-repo"],
      ["maintainers", "mock-pubkey"],
      ["t", "example"],
      ["t", "demo"],
    ],
  };

  const currentState: RepoStateEvent = {
    kind: 30618,
    id: "mock-state-id",
    pubkey: "mock-pubkey",
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    sig: "mock-signature",
    tags: [
      ["d", "example-repo"],
      ["refs/heads/main", "abc123def456"],
      ["refs/heads/develop", "def456ghi789"],
      ["refs/tags/v1.0.0", "ghi789jkl012"],
      ["HEAD", "ref: refs/heads/main"],
    ],
  };

  // Initialize the edit repository hook
  const editRepo = useEditRepo();

  // Example event signing closure (would be provided by parent app)
  const signEvent = async (event: Partial<Event>): Promise<Event> => {
    // This would use the app's signer (NIP-07, NIP-46, etc.)
    console.log("Signing repository update event:", event);

    // Mock implementation - replace with actual signing logic
    return {
      ...event,
      id: "mock-updated-event-id",
      pubkey: "mock-user-pubkey",
      sig: "mock-signature",
      created_at: Math.floor(Date.now() / 1000),
    } as Event;
  };

  // Example event publishing closure (would be provided by parent app)
  const publishEvent = async (event: Event): Promise<void> => {
    // This would publish to the app's configured relays
    console.log("Publishing repository update event:", event);

    // Mock implementation - replace with actual publishing logic
    // await pool.publish(relays, event);
  };

  // Example store update closure (would be provided by parent app)
  const updateStore = async (repoId: string, updates: any): Promise<void> => {
    // This would update the app's global repository store/state
    console.log("Updating repository store:", { repoId, updates });

    // Mock implementation - replace with actual store integration
    // await repoStore.updateRepository(repoId, updates);
  };

  function handleOpenEditPanel() {
    showEditPanel = true;
  }

  function handleCloseEditPanel() {
    showEditPanel = false;
    editRepo.reset();
  }

  async function handleSaveRepo(config: any) {
    try {
      await editRepo.editRepository(currentAnnouncement, currentState, config, {
        token: "ghp_example_token_here", // Would come from token store
        repoDir: "/repos/example-repo", // Would come from repo manager
        onSignEvent: signEvent,
        onPublishEvent: publishEvent,
        onUpdateStore: updateStore,
      });

      // Panel will close automatically on success via progress.isComplete
      if (editRepo.progress?.isComplete) {
        setTimeout(() => {
          showEditPanel = false;
        }, 2000); // Show success for 2 seconds
      }
    } catch (error) {
      console.error("Edit failed:", error);
      // Error is handled by the panel component
    }
  }
</script>

<!-- Example usage of Edit Repository feature -->
<div class="p-6 space-y-4">
  <h2 class="text-2xl font-bold text-white">Edit Repository Example</h2>

  <p class="text-gray-300">
    This example demonstrates how to integrate the Edit Repository feature with your application's
    event signing, publishing, and repository management.
  </p>

  <!-- Current Repository Display -->
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-600">
    <h3 class="text-lg font-semibold text-white mb-2">Current Repository</h3>
    <div class="space-y-2">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-gray-400">Name:</span>
          <span class="text-white ml-2">{getTagValue(currentAnnouncement as any, "name")}</span>
        </div>
        <div>
          <span class="text-gray-400">Visibility:</span>
          <span class="text-white ml-2">
            {getTagValue(currentAnnouncement as any, "clone")?.includes("private")
              ? "Private"
              : "Public"}
          </span>
        </div>
        <div class="md:col-span-2">
          <span class="text-gray-400">Description:</span>
          <span class="text-white ml-2"
            >{getTagValue(currentAnnouncement as any, "description")}</span
          >
        </div>
        <div>
          <span class="text-gray-400">Default Branch:</span>
          <span class="text-white ml-2">
            {getTagValue(currentState as any, "HEAD")?.replace("ref: refs/heads/", "") || "main"}
          </span>
        </div>
        <div>
          <span class="text-gray-400">Clone URL:</span>
          <span class="text-white ml-2 font-mono text-xs">
            {getTagValue(currentAnnouncement as any, "clone")}
          </span>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit Repository Button -->
  <button
    onclick={handleOpenEditPanel}
    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center space-x-2"
  >
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      ></path>
    </svg>
    <span>Edit Repository</span>
  </button>

  <!-- Edit Repository Panel -->
  {#if showEditPanel}
    <EditRepoPanel
      isOpen={showEditPanel}
      currentAnnouncement={currentAnnouncement}
      currentState={currentState}
      onClose={handleCloseEditPanel}
      onSave={handleSaveRepo}
      onSignEvent={signEvent}
      onPublishEvent={publishEvent}
      progress={editRepo.progress}
      error={editRepo.error}
      isEditing={editRepo.isEditing}
    />
  {/if}

  <!-- Status Display -->
  {#if editRepo.progress}
    <div class="mt-4 p-4 bg-gray-800 rounded-lg">
      <h3 class="text-lg font-semibold text-white mb-2">Edit Status</h3>
      <p class="text-gray-300">{editRepo.progress.stage}</p>
      <div class="w-full bg-gray-700 rounded-full h-2 mt-2">
        <div
          class="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style="width: {editRepo.progress.percentage}%"
        ></div>
      </div>
      <div class="text-right text-sm text-gray-400 mt-1">
        {Math.round(editRepo.progress.percentage)}%
      </div>
    </div>
  {/if}

  {#if editRepo.error}
    <div class="mt-4 p-4 bg-red-900/50 border border-red-500 rounded-lg">
      <h3 class="text-lg font-semibold text-red-400 mb-2">Edit Error</h3>
      <p class="text-red-300">{editRepo.error}</p>
    </div>
  {/if}

  <!-- Integration Notes -->
  <div class="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
    <h3 class="text-lg font-semibold text-blue-400 mb-2">Integration Notes</h3>
    <ul class="text-blue-300 text-sm space-y-1">
      <li>• Replace mock events with actual Nostr repository events</li>
      <li>• Connect to real Git token store for authentication</li>
      <li>• Integrate with actual repository directory management</li>
      <li>• Replace mock signing/publishing with actual Nostr signer integration</li>
      <li>• Connect to global repository store for updates</li>
      <li>• Add proper error handling and validation</li>
      <li>• Implement repository navigation after successful edit</li>
    </ul>
  </div>

  <!-- Event Structure Display -->
  <div class="mt-6 p-4 bg-gray-800 rounded-lg">
    <h3 class="text-lg font-semibold text-white mb-2">Current Event Structure</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <h4 class="text-sm font-medium text-gray-300 mb-2">Repository Announcement (Kind 30617)</h4>
        <pre class="text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto">
{JSON.stringify(
            {
              kind: currentAnnouncement.kind,
              tags: currentAnnouncement.tags.slice(0, 5), // Show first 5 tags
            },
            null,
            2
          )}
        </pre>
      </div>
      <div>
        <h4 class="text-sm font-medium text-gray-300 mb-2">Repository State (Kind 30618)</h4>
        <pre class="text-xs text-gray-400 bg-gray-900 p-2 rounded overflow-x-auto">
{JSON.stringify(
            {
              kind: currentState.kind,
              tags: currentState.tags.slice(0, 5), // Show first 5 tags
            },
            null,
            2
          )}
        </pre>
      </div>
    </div>
  </div>
</div>

<style>
  /* Additional styles can be added here if needed */
</style>
