<script lang="ts">
  interface Props {
    isCreating: boolean;
    progress: {
      step: string;
      message: string;
      completed: boolean;
      error?: string;
    }[];
    onRetry?: () => void;
    onClose?: () => void;
  }

  const {
    isCreating,
    progress,
    onRetry,
    onClose
  }: Props = $props();

  const completedSteps = $derived(progress.filter(step => step.completed).length);
  const totalSteps = $derived(progress.length);
  const progressPercentage = $derived(totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0);
  const hasErrors = $derived(progress.some(step => step.error));
  const isComplete = $derived(completedSteps === totalSteps && !hasErrors);
</script>

<div class="space-y-6">
  <div class="space-y-4">
    <h2 class="text-xl font-semibold text-gray-100">
      {#if isCreating}
        Creating Repository...
      {:else if isComplete}
        Repository Created Successfully!
      {:else if hasErrors}
        Repository Creation Failed
      {:else}
        Ready to Create Repository
      {/if}
    </h2>
    
    {#if isCreating}
      <p class="text-sm text-gray-300">
        Please wait while we set up your repository.
      </p>
    {:else if isComplete}
      <p class="text-sm text-green-400">
        Your repository has been created and is ready to use.
      </p>
    {:else if hasErrors}
      <p class="text-sm text-red-400">
        There was an error creating your repository. Please try again.
      </p>
    {/if}
  </div>

  <!-- Progress Bar -->
  {#if isCreating || progress.length > 0}
    <div class="space-y-2">
      <div class="flex justify-between text-sm">
        <span class="text-gray-400">Progress</span>
        <span class="text-gray-400">{completedSteps}/{totalSteps}</span>
      </div>
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          class="h-2 rounded-full transition-all duration-300 ease-in-out"
          class:bg-blue-600={isCreating && !hasErrors}
          class:bg-green-600={isComplete}
          class:bg-red-600={hasErrors}
          style="width: {progressPercentage}%"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Progress Steps -->
  {#if progress.length > 0}
    <div class="space-y-3">
      {#each progress as step, index}
        <div class="flex items-start space-x-3">
          <!-- Step Icon -->
          <div class="flex-shrink-0 mt-0.5">
            {#if step.error}
              <div class="w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                <svg class="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </div>
            {:else if step.completed}
              <div class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <svg class="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
            {:else}
              <div class="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center">
                {#if isCreating}
                  <div class="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                {:else}
                  <div class="w-2 h-2 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Step Content -->
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-100">
              {step.step}
            </div>
            <div class="text-sm text-gray-400">
              {step.message}
            </div>
            {#if step.error}
              <div class="text-sm text-red-400 mt-1">
                Error: {step.error}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Action Buttons -->
  {#if !isCreating}
    <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
      {#if hasErrors && onRetry}
        <button
          onclick={onRetry}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Try Again
        </button>
      {/if}
      
      {#if onClose}
        <button
          onclick={onClose}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          {isComplete ? 'Done' : 'Close'}
        </button>
      {/if}
    </div>
  {/if}
</div>
