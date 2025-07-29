<script lang="ts">
  import { Settings, Save, X, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, GitBranch, FileText } from 'lucide-svelte';
  import type { Event } from 'nostr-tools';
  import type { RepoAnnouncementEvent, RepoStateEvent } from '@nostr-git/shared-types';

  // Types for edit configuration and progress
  interface EditProgress {
    stage: string;
    percentage: number;
    isComplete: boolean;
  }

  interface EditConfig {
    name: string;
    description: string;
    visibility: 'public' | 'private';
    defaultBranch: string;
    readmeContent: string;
  }

  // Component props
  interface Props {
    isOpen: boolean;
    currentAnnouncement: RepoAnnouncementEvent;
    currentState: RepoStateEvent;
    onClose: () => void;
    onSave: (config: EditConfig) => Promise<void>;
    onSignEvent: (event: Partial<Event>) => Promise<Event>;
    onPublishEvent: (event: Event) => Promise<void>;
    progress?: EditProgress;
    error?: string;
    isEditing?: boolean;
  }

  const {
    isOpen,
    currentAnnouncement,
    currentState,
    onClose,
    onSave,
    onSignEvent,
    onPublishEvent,
    progress,
    error,
    isEditing = false
  }: Props = $props();

  // Extract current values from events
  function extractCurrentValues() {
    const nameTag = currentAnnouncement.tags.find(t => t[0] === 'name')?.[1] || '';
    const descTag = currentAnnouncement.tags.find(t => t[0] === 'description')?.[1] || '';
    const cloneTag = currentAnnouncement.tags.find(t => t[0] === 'clone')?.[1] || '';
    const headTag = currentState.tags.find(t => t[0] === 'HEAD')?.[1] || '';
    
    // Extract default branch from HEAD ref
    const defaultBranch = headTag.replace('ref: refs/heads/', '') || 'main';
    
    // Determine visibility from clone URL (basic heuristic)
    const isPrivate = cloneTag.includes('private') || false;
    
    return {
      name: nameTag,
      description: descTag,
      visibility: isPrivate ? 'private' : 'public' as 'public' | 'private',
      defaultBranch,
      readmeContent: '# ' + nameTag + '\n\n' + descTag // Default README content
    };
  }

  // Form state - initialize with current values
  let formData = $state(extractCurrentValues());
  
  // UI state
  let validationErrors = $state<Record<string, string>>({});
  let showReadmePreview = $state(false);

  // Update form data when props change
  $effect(() => {
    if (currentAnnouncement && currentState && !isEditing) {
      formData = extractCurrentValues();
    }
  });

  function validateForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    
    // Repository name validation
    if (!formData.name.trim()) {
      errors.name = 'Repository name is required';
    } else if (formData.name.length < 1 || formData.name.length > 100) {
      errors.name = 'Repository name must be between 1 and 100 characters';
    } else if (!/^[a-zA-Z0-9._-]+$/.test(formData.name)) {
      errors.name = 'Repository name can only contain letters, numbers, dots, hyphens, and underscores';
    }
    
    // Description validation
    if (formData.description.length > 500) {
      errors.description = 'Description must be 500 characters or less';
    }
    
    // Default branch validation
    if (!formData.defaultBranch.trim()) {
      errors.defaultBranch = 'Default branch is required';
    } else if (!/^[a-zA-Z0-9._/-]+$/.test(formData.defaultBranch)) {
      errors.defaultBranch = 'Invalid branch name format';
    }
    
    // README validation
    if (formData.readmeContent.length > 10000) {
      errors.readmeContent = 'README content must be 10,000 characters or less';
    }
    
    return errors;
  }

  // Validate form on input
  $effect(() => {
    validationErrors = validateForm();
  });

  function handleCancel() {
    if (!isEditing) {
      onClose();
    }
  }

  async function handleSave() {
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      validationErrors = errors;
      return;
    }

    try {
      await onSave(formData);
    } catch (error) {
      console.error('Save failed:', error);
      // Error handling is managed by parent component
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
      onClose();
    }
  }

  // Check if form has changes
  $derived isFormDirty = (() => {
    const original = extractCurrentValues();
    return (
      formData.name !== original.name ||
      formData.description !== original.description ||
      formData.visibility !== original.visibility ||
      formData.defaultBranch !== original.defaultBranch ||
      formData.readmeContent !== original.readmeContent
    );
  })();

  // Check if form is valid
  $derived isFormValid = Object.keys(validationErrors).length === 0;
</script>

<!-- Edit Repository Panel -->
{#if isOpen}
  <div 
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    onclick={handleBackdropClick}
  >
    <div class="bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-700">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-700">
        <div class="flex items-center space-x-3">
          <Settings class="w-6 h-6 text-blue-400" />
          <h2 class="text-xl font-semibold text-white">Edit Repository</h2>
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
      <div class="flex-1 overflow-y-auto">
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
                placeholder="Enter repository name"
              />
              {#if validationErrors.name}
                <p class="text-red-400 text-sm mt-1 flex items-center space-x-1">
                  <AlertCircle class="w-4 h-4" />
                  <span>{validationErrors.name}</span>
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
                    bind:group={formData.visibility}
                    value="public"
                    disabled={isEditing}
                    class="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div class="flex items-center space-x-2">
                    <Eye class="w-4 h-4 text-gray-400" />
                    <span class="text-white">Public</span>
                  </div>
                </label>
                <label class="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    bind:group={formData.visibility}
                    value="private"
                    disabled={isEditing}
                    class="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <div class="flex items-center space-x-2">
                    <EyeOff class="w-4 h-4 text-gray-400" />
                    <span class="text-white">Private</span>
                  </div>
                </label>
              </div>
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
              placeholder="Enter repository description"
            ></textarea>
            {#if validationErrors.description}
              <p class="text-red-400 text-sm mt-1 flex items-center space-x-1">
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
            <input
              id="default-branch"
              type="text"
              bind:value={formData.defaultBranch}
              disabled={isEditing}
              class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="main"
            />
            {#if validationErrors.defaultBranch}
              <p class="text-red-400 text-sm mt-1 flex items-center space-x-1">
                <AlertCircle class="w-4 h-4" />
                <span>{validationErrors.defaultBranch}</span>
              </p>
            {/if}
          </div>

          <!-- README Editor -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-gray-300">
                <FileText class="w-4 h-4 inline mr-1" />
                README.md
              </label>
              <button
                onclick={() => showReadmePreview = !showReadmePreview}
                disabled={isEditing}
                class="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
              >
                {showReadmePreview ? 'Edit' : 'Preview'}
              </button>
            </div>
            
            {#if showReadmePreview}
              <!-- README Preview -->
              <div class="w-full min-h-[200px] p-3 bg-gray-800 border border-gray-600 rounded-lg text-white prose prose-invert max-w-none">
                {@html formData.readmeContent.replace(/\n/g, '<br>')}
              </div>
            {:else}
              <!-- README Editor -->
              <textarea
                bind:value={formData.readmeContent}
                disabled={isEditing}
                rows="10"
                class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-y font-mono text-sm"
                placeholder="# Repository Name&#10;&#10;Description of your repository..."
              ></textarea>
            {/if}
            {#if validationErrors.readmeContent}
              <p class="text-red-400 text-sm mt-1 flex items-center space-x-1">
                <AlertCircle class="w-4 h-4" />
                <span>{validationErrors.readmeContent}</span>
              </p>
            {/if}
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
  
  /* Prose styles for README preview */
  .prose h1 { @apply text-2xl font-bold text-white mb-4; }
  .prose h2 { @apply text-xl font-semibold text-white mb-3; }
  .prose h3 { @apply text-lg font-medium text-white mb-2; }
  .prose p { @apply text-gray-300 mb-2; }
  .prose ul { @apply list-disc list-inside text-gray-300 mb-2; }
  .prose ol { @apply list-decimal list-inside text-gray-300 mb-2; }
  .prose code { @apply bg-gray-700 px-1 py-0.5 rounded text-sm; }
  .prose pre { @apply bg-gray-700 p-3 rounded overflow-x-auto; }
</style>
