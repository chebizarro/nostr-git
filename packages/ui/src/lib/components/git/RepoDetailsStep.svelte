<script lang="ts">
  import { checkGitHubRepoAvailability } from '../../useNewRepo.svelte.js';
  import { tokens as tokensStore, type Token } from '../../stores/tokens.js';
  
  interface Props {
    repoName: string;
    description: string;
    initializeWithReadme: boolean;
    defaultBranch: string;
    gitignoreTemplate: string;
    licenseTemplate: string;
    onRepoNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    onReadmeChange: (initialize: boolean) => void;
    onDefaultBranchChange: (branch: string) => void;
    onGitignoreChange: (template: string) => void;
    onLicenseChange: (template: string) => void;
    validationErrors?: {
      name?: string;
      description?: string;
    };
  }

  const {
    repoName,
    description,
    initializeWithReadme,
    defaultBranch,
    gitignoreTemplate,
    licenseTemplate,
    onRepoNameChange,
    onDescriptionChange,
    onReadmeChange,
    onDefaultBranchChange,
    onGitignoreChange,
    onLicenseChange,
    validationErrors = {}
  }: Props = $props();
  
  // State for real-time repository name validation
  let isCheckingAvailability = $state(false);
  let availabilityStatus = $state<'available' | 'unavailable' | 'error' | null>(null);
  let availabilityMessage = $state<string>('');
  let lastCheckedName = $state<string>('');
  let tokens = $state<Token[]>([]);
  
  // Subscribe to token store
  tokensStore.subscribe((t) => {
    tokens = t;
  });

  const gitignoreOptions = [
    { value: '', label: 'None' },
    { value: 'node', label: 'Node.js' },
    { value: 'python', label: 'Python' },
    { value: 'web', label: 'Web Development' },
    { value: 'svelte', label: 'Svelte' }
  ];

  const licenseOptions = [
    { value: '', label: 'None' },
    { value: 'mit', label: 'MIT License' },
    { value: 'apache-2.0', label: 'Apache License 2.0' }
  ];

  function handleGitignoreChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    onGitignoreChange(target.value);
  }

  function handleLicenseChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    onLicenseChange(target.value);
  }

  function handleBranchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    onDefaultBranchChange(target.value);
  }

  function validateRepoName(name: string): string | undefined {
    if (!name.trim()) {
      return 'Repository name is required';
    }
    if (name.length < 3) {
      return 'Repository name must be at least 3 characters';
    }
    if (name.length > 100) {
      return 'Repository name must be 100 characters or less';
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return 'Repository name can only contain letters, numbers, dots, hyphens, and underscores';
    }
    return undefined;
  }

  function validateDescription(desc: string): string | undefined {
    if (desc.length > 350) {
      return 'Description must be 350 characters or less';
    }
    return undefined;
  }

  async function checkRepoNameAvailability(name: string) {
    // Reset state
    availabilityStatus = null;
    availabilityMessage = '';
    
    // Skip check if name is empty or invalid
    const basicValidation = validateRepoName(name);
    if (basicValidation || !name.trim()) {
      return;
    }
    
    // Skip if we already checked this name
    if (name === lastCheckedName) {
      return;
    }
    
    // Get GitHub token
    const githubToken = tokens.find((t: Token) => t.host === "github.com")?.token;
    if (!githubToken) {
      availabilityStatus = 'error';
      availabilityMessage = 'GitHub token required for availability check';
      return;
    }
    
    isCheckingAvailability = true;
    lastCheckedName = name;
    
    try {
      const result = await checkGitHubRepoAvailability(name, githubToken);
      
      if (result.available) {
        availabilityStatus = 'available';
        availabilityMessage = result.username ? `${result.username}/${name} is available` : 'Repository name is available';
      } else {
        availabilityStatus = 'unavailable';
        availabilityMessage = result.reason || 'Repository name is not available';
      }
    } catch (error) {
      availabilityStatus = 'error';
      availabilityMessage = 'Could not check availability';
      console.warn('Error checking repo availability:', error);
    } finally {
      isCheckingAvailability = false;
    }
  }

  function handleNameInput(event: Event) {
    const target = event.target as HTMLInputElement;
    onRepoNameChange(target.value);
    
    // Reset availability status when user types
    if (target.value !== lastCheckedName) {
      availabilityStatus = null;
      availabilityMessage = '';
    }
  }
  
  function handleNameBlur(event: Event) {
    const target = event.target as HTMLInputElement;
    const name = target.value.trim();
    
    if (name && name !== lastCheckedName) {
      checkRepoNameAvailability(name);
    }
  }

  function handleDescriptionInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    onDescriptionChange(target.value);
  }



  function handleReadmeChange(event: Event) {
    const target = event.target as HTMLInputElement;
    onReadmeChange(target.checked);
  }
</script>

<div class="space-y-6">
  <div class="space-y-4">
    <h2 class="text-xl font-semibold text-gray-100">
      Repository Details
    </h2>
    <p class="text-sm text-gray-300">
      Set up the basic information for your new repository.
    </p>
  </div>

  <div class="space-y-4">
    <!-- Repository Name -->
    <div>
      <label for="repo-name" class="block text-sm font-medium text-gray-300 mb-2">
        Repository name *
      </label>
      <div class="relative">
        <input
          id="repo-name"
          type="text"
          value={repoName}
          oninput={handleNameInput}
          onblur={handleNameBlur}
          placeholder="my-awesome-project"
          class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          class:border-red-500={validationErrors.name || availabilityStatus === 'unavailable'}
          class:border-green-500={availabilityStatus === 'available'}
          class:focus:ring-red-500={validationErrors.name || availabilityStatus === 'unavailable'}
          class:focus:ring-green-500={availabilityStatus === 'available'}
          class:focus:border-red-500={validationErrors.name || availabilityStatus === 'unavailable'}
          class:focus:border-green-500={availabilityStatus === 'available'}
        />
        
        <!-- Loading/Status Indicator -->
        <div class="absolute inset-y-0 right-0 flex items-center pr-3">
          {#if isCheckingAvailability}
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          {:else if availabilityStatus === 'available'}
            <svg class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          {:else if availabilityStatus === 'unavailable'}
            <svg class="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          {:else if availabilityStatus === 'error'}
            <svg class="h-4 w-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          {/if}
        </div>
      </div>
      
      <!-- Error Messages -->
      {#if validationErrors.name}
        <p class="mt-1 text-sm text-red-400">
          {validationErrors.name}
        </p>
      {:else if availabilityMessage}
        <p class="mt-1 text-sm" 
           class:text-green-400={availabilityStatus === 'available'}
           class:text-red-400={availabilityStatus === 'unavailable'}
           class:text-yellow-400={availabilityStatus === 'error'}>
          {availabilityMessage}
        </p>
      {/if}
    </div>

    <!-- Description -->
    <div>
      <label for="repo-description" class="block text-sm font-medium text-gray-300 mb-2">
        Description (optional)
      </label>
      <textarea
        id="repo-description"
        value={description}
        oninput={handleDescriptionInput}
        placeholder="A brief description of your repository"
        rows="3"
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 resize-vertical"
        class:border-red-500={validationErrors.description}
        class:focus:ring-red-500={validationErrors.description}
        class:focus:border-red-500={validationErrors.description}
      ></textarea>
      <div class="mt-1 flex justify-between items-center">
        {#if validationErrors.description}
          <p class="text-sm text-red-400">
            {validationErrors.description}
          </p>
        {:else}
          <p class="text-sm text-gray-400">
            {description.length}/350 characters
          </p>
        {/if}
      </div>
    </div>

    <!-- Initialize with README -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <div class="space-y-3">
        <h3 class="text-sm font-medium text-gray-300">
          Initialize repository
        </h3>
        <label class="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={initializeWithReadme}
            onchange={handleReadmeChange}
            class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <div>
            <div class="text-sm font-medium text-gray-100">
              Add a README file
            </div>
            <div class="text-sm text-gray-400">
              This is where you can write a long description for your project
            </div>
          </div>
        </label>

        <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
          <div class="space-y-4">
            <div>
              <label for="default-branch" class="block text-sm font-medium text-gray-300 mb-2">
                Default branch name
              </label>
              <input
                id="default-branch"
                type="text"
                value={defaultBranch}
                oninput={handleBranchInput}
                placeholder="master"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>

            <!-- .gitignore Template -->
            <div>
              <label for="gitignore-template" class="block text-sm font-medium text-gray-300 mb-2">
                .gitignore template
              </label>
              <select
                id="gitignore-template"
                value={gitignoreTemplate}
                onchange={handleGitignoreChange}
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              >
                {#each gitignoreOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>

            <!-- License Template -->
            <div>
              <label for="license-template" class="block text-sm font-medium text-gray-300 mb-2">
                License
              </label>
              <select
                id="license-template"
                value={licenseTemplate}
                onchange={handleLicenseChange}
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
              >
                {#each licenseOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
