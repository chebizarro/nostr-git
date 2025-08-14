<script lang="ts">
  import RepoDetailsStep from './RepoDetailsStep.svelte';
  import AdvancedSettingsStep from './AdvancedSettingsStep.svelte';
  import RepoProgressStep from './RepoProgressStep.svelte';
  import StepChooseService from './steps/StepChooseService.svelte';
  import { type Event as NostrEvent } from 'nostr-tools';
  import { useRegistry } from '../../useRegistry';
  import { useNewRepo, type NewRepoResult, checkProviderRepoAvailability } from '$lib/useNewRepo.svelte';
  import { tokens as tokensStore, type Token } from '$lib/stores/tokens.js';
  import { createGraspServersStore } from '$lib/stores/graspServers';
  
  const { Button } = useRegistry();

  interface Props {
    onRepoCreated?: (repoData: NewRepoResult) => void;
    onCancel?: () => void;
    onPublishEvent?: (event: Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'>) => Promise<void>;
    graspServerUrls?: string[]; // optional: preloaded grasp server options
  }

  const { onRepoCreated, onCancel, onPublishEvent, graspServerUrls = [] }: Props = $props();

  // Initialize the useNewRepo hook
  const { createRepository, isCreating, progress, error, reset } = useNewRepo({
    onProgress: (steps) => {
      // Transform status to completed boolean for RepoProgressStep
      progressSteps = steps.map(step => ({
        step: step.step,
        message: step.message,
        completed: step.status === 'completed',
        error: step.error
      }));
    },
    onRepoCreated: (result) => {
      onRepoCreated?.(result);
    },
    onPublishEvent: onPublishEvent
  });

  // Token management
  let tokens = $state<Token[]>([]);
  let selectedProvider = $state<string | undefined>(undefined);
  let graspRelayUrl = $state<string>('');
  // Grasp server options derived from store
  const graspServerStore = createGraspServersStore(graspServerUrls);
  let graspServerOptions = $state<string[]>(graspServerUrls);
  graspServerStore.subscribe((s) => {
    graspServerOptions = s.urls;
  });

  // Repository name availability tracking
  let nameAvailabilityResults = $state<{
    results: Array<{
      provider: string;
      host: string;
      available: boolean;
      reason?: string;
      username?: string;
      error?: string;
    }>;
    hasConflicts: boolean;
    availableProviders: string[];
    conflictProviders: string[];
  } | null>(null);
  let isCheckingAvailability = $state(false);

  // Subscribe to token store changes
  tokensStore.subscribe((t) => {
    tokens = t;
  });

  // Step management (1: Choose Service, 2: Repo Details, 3: Advanced, 4: Create)
  let currentStep = $state(1);
  const totalSteps = 4;

  // Repository details (Step 1)
  let repoDetails = $state({
    name: '',
    description: '',
    initializeWithReadme: true
  });

  // Advanced settings (Step 2)
  let advancedSettings = $state({
    gitignoreTemplate: '',
    licenseTemplate: '',
    defaultBranch: 'master',
    // Author information (should be populated from current user)
    authorName: '',
    authorEmail: '',
    // NIP-34 metadata
    maintainers: [] as string[],
    relays: [] as string[],
    tags: [] as string[],
    webUrl: '',
    cloneUrl: ''
  });

  // Creation progress (Step 3) - now managed by useNewRepo hook
  let progressSteps = $state<{
    step: string;
    message: string;
    completed: boolean;
    error?: string;
  }[]>([]);

  // Validation
  interface ValidationErrors {
    name?: string;
    description?: string;
  }

  let validationErrors = $state<ValidationErrors>({});

  // Check repository name availability across all providers
  async function checkNameAvailability(name: string) {
    if (!name.trim() || tokens.length === 0 || !selectedProvider) {
      nameAvailabilityResults = null;
      return;
    }

    isCheckingAvailability = true;
    try {
      const results = await checkProviderRepoAvailability(
        selectedProvider as string,
        name,
        tokens,
        selectedProvider === 'grasp' ? graspRelayUrl : undefined
      );
      nameAvailabilityResults = results;
    } catch (error) {
      console.error('Error checking name availability:', error);
      nameAvailabilityResults = null;
    } finally {
      isCheckingAvailability = false;
    }
  }

  // Debounced name availability check
  let nameCheckTimeout: number | null = null;
  function debouncedNameCheck(name: string) {
    if (nameCheckTimeout) {
      clearTimeout(nameCheckTimeout);
    }
    nameCheckTimeout = setTimeout(() => {
      checkNameAvailability(name);
    }, 500) as any;
  }

  // Validation functions
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
    
    // Note: We no longer block form progression for name conflicts
    // This allows users to proceed even with conflicts, but we'll disable those providers later
    
    return undefined;
  }

  function validateDescription(description: string): string | undefined {
    if (description.length > 350) {
      return 'Description must be 350 characters or less';
    }
    return undefined;
  }

  function validateStep1(): boolean {
    const errors: ValidationErrors = {};
    
    const nameError = validateRepoName(repoDetails.name);
    if (nameError) errors.name = nameError;
    
    const descError = validateDescription(repoDetails.description);
    if (descError) errors.description = descError;
    
    return Object.keys(errors).length === 0;
  }

  function updateValidationErrors() {
    const errors: ValidationErrors = {};
    
    const nameError = validateRepoName(repoDetails.name);
    if (nameError) errors.name = nameError;
    
    const descError = validateDescription(repoDetails.description);
    if (descError) errors.description = descError;
    
    validationErrors = errors;
  }

  // Navigation
  function nextStep() {
    if (currentStep === 1) {
      // Require provider selection (and valid GRASP relay when applicable)
      if (selectedProvider && isValidGraspConfig()) {
        currentStep = 2;
      }
    } else if (currentStep === 2 && validateStep1()) {
      currentStep = 3;
    } else if (currentStep === 3) {
      currentStep = 4; // Go to creation progress
      startRepositoryCreation();
    }
  }

  function prevStep() {
    if (currentStep === 2) {
      currentStep = 1;
    } else if (currentStep === 3) {
      currentStep = 2;
    } else if (currentStep === 4 && !isCreating()) {
      currentStep = 3;
    }
  }

  // Provider selection handler
  function handleProviderChange(provider: string) {
    selectedProvider = provider;
    // Clear previous availability results when provider changes
    nameAvailabilityResults = null;
    // Auto re-check if a name is already entered
    if (repoDetails.name && repoDetails.name.trim().length > 0) {
      debouncedNameCheck(repoDetails.name);
    }
  }

  // GRASP relay URL handler
  function handleRelayUrlChange(url: string) {
    graspRelayUrl = url;
    // For GRASP, re-check availability when relay changes and name is present
    if (selectedProvider === 'grasp' && repoDetails.name && repoDetails.name.trim().length > 0) {
      debouncedNameCheck(repoDetails.name);
    }
  }

  // Validate relay URL for GRASP provider
  function isValidGraspConfig(): boolean {
    if (selectedProvider !== 'grasp') return true;
    return graspRelayUrl.trim() !== '' && (graspRelayUrl.startsWith('wss://') || graspRelayUrl.startsWith('ws://'));
  }

  // Repository creation using useNewRepo hook
  async function startRepositoryCreation() {
    if (!validateStep1()) return;

    try {
      await createRepository({
        name: repoDetails.name,
        description: repoDetails.description,
        initializeWithReadme: repoDetails.initializeWithReadme,
        gitignoreTemplate: advancedSettings.gitignoreTemplate,
        licenseTemplate: advancedSettings.licenseTemplate,
        defaultBranch: advancedSettings.defaultBranch,
        provider: selectedProvider, // Pass the selected provider
        relayUrl: selectedProvider === 'grasp' ? graspRelayUrl : undefined, // Pass relay URL for GRASP
        authorName: advancedSettings.authorName,
        authorEmail: advancedSettings.authorEmail,
        maintainers: advancedSettings.maintainers,
        relays: advancedSettings.relays,
        tags: advancedSettings.tags,
        webUrl: advancedSettings.webUrl,
        cloneUrl: advancedSettings.cloneUrl
      });
    } catch (error) {
      console.error('Repository creation failed:', error);
    }
  }

  function handleRetry() {
    // Reset progress and try again using the hook
    reset();
    startRepositoryCreation();
  }

  function handleClose() {
    if (onCancel) {
      onCancel();
    }
  }

  // Step component event handlers
  function handleRepoNameChange(name: string) {
    repoDetails.name = name;
    // Trigger debounced availability check
    debouncedNameCheck(name);
    // Update validation errors after change
    updateValidationErrors();
  }

  function handleDescriptionChange(description: string) {
    repoDetails.description = description;
    // Update validation errors after change
    updateValidationErrors();
  }

  function handleReadmeChange(initialize: boolean) {
    repoDetails.initializeWithReadme = initialize;
  }

  function handleGitignoreChange(template: string) {
    advancedSettings.gitignoreTemplate = template;
  }

  function handleLicenseChange(template: string) {
    advancedSettings.licenseTemplate = template;
  }

  function handleDefaultBranchChange(branch: string) {
    advancedSettings.defaultBranch = branch;
  }

  // Author information handlers
  function handleAuthorNameChange(name: string) {
    advancedSettings.authorName = name;
  }

  function handleAuthorEmailChange(email: string) {
    advancedSettings.authorEmail = email;
  }

  // NIP-34 metadata handlers
  function handleMaintainersChange(maintainers: string[]) {
    advancedSettings.maintainers = maintainers;
  }

  function handleRelaysChange(relays: string[]) {
    advancedSettings.relays = relays;
  }

  function handleTagsChange(tags: string[]) {
    advancedSettings.tags = tags;
  }

  function handleWebUrlChange(url: string) {
    advancedSettings.webUrl = url;
  }

  function handleCloneUrlChange(url: string) {
    advancedSettings.cloneUrl = url;
  }
</script>

<div
 class="max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto p-6 space-y-6 bg-background text-foreground rounded-lg border border-border shadow">
  <!-- Header -->
  <div class="text-center space-y-2">
    <h1 class="text-3xl font-bold tracking-tight text-foreground">
      Create a New Repository
    </h1>
    <p class="text-muted-foreground">
      Set up a new git repository with Nostr integration
    </p>
  </div>

  <!-- Progress Indicator -->
  <div class="flex items-center justify-center space-x-4 mb-8">
    <div class="flex items-center space-x-2">
      <div 
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
        class:bg-accent={currentStep >= 1}
        class:text-accent-foreground={currentStep >= 1}
        class:bg-muted={currentStep < 1}
        class:text-muted-foreground={currentStep < 1}
      >
        {currentStep > 1 ? '✓' : '1'}
      </div>
      <span class="text-sm font-medium text-foreground">Choose Service</span>
    </div>
    
    <div class="w-12 h-px bg-border"></div>
    
    <div class="flex items-center space-x-2">
      <div 
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
        class:bg-accent={currentStep >= 2}
        class:text-accent-foreground={currentStep >= 2}
        class:bg-muted={currentStep < 2}
        class:text-muted-foreground={currentStep < 2}
      >
        {currentStep > 2 ? '✓' : '2'}
      </div>
      <span class="text-sm font-medium text-foreground">Repository Details</span>
    </div>
    
    <div class="w-12 h-px bg-border"></div>
    
    <div class="flex items-center space-x-2">
      <div 
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
        class:bg-accent={currentStep >= 3}
        class:text-accent-foreground={currentStep >= 3}
        class:bg-muted={currentStep < 3}
        class:text-muted-foreground={currentStep < 3}
      >
        {currentStep > 3 ? '✓' : '3'}
      </div>
      <span class="text-sm font-medium text-foreground">Advanced Settings</span>
    </div>
    
    <div class="w-12 h-px bg-border"></div>
    
    <div class="flex items-center space-x-2">
      <div 
        class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
        class:bg-accent={currentStep >= 4}
        class:text-accent-foreground={currentStep >= 4}
        class:bg-muted={currentStep < 4}
        class:text-muted-foreground={currentStep < 4}
      >
        {currentStep > 4 ? '✓' : '4'}
      </div>
      <span class="text-sm font-medium text-foreground">Create Repository</span>
    </div>
  </div>

  <!-- Step Content -->
  <div class="bg-card text-card-foreground rounded-lg border shadow-sm p-6 max-h-[70vh] overflow-auto">
    {#if currentStep === 1}
      <StepChooseService
        tokens={tokens}
        selectedProvider={selectedProvider as any}
        onProviderChange={handleProviderChange as any}
        disabledProviders={nameAvailabilityResults?.conflictProviders || []}
        relayUrl={graspRelayUrl}
        onRelayUrlChange={handleRelayUrlChange}
        graspServerOptions={graspServerOptions}
      />
    {:else if currentStep === 2}
      <RepoDetailsStep
        repoName={repoDetails.name}
        description={repoDetails.description}
        initializeWithReadme={repoDetails.initializeWithReadme}
        defaultBranch={advancedSettings.defaultBranch}
        gitignoreTemplate={advancedSettings.gitignoreTemplate}
        licenseTemplate={advancedSettings.licenseTemplate}
        onRepoNameChange={handleRepoNameChange}
        onDescriptionChange={handleDescriptionChange}
        onReadmeChange={handleReadmeChange}
        onDefaultBranchChange={handleDefaultBranchChange}
        onGitignoreChange={handleGitignoreChange}
        onLicenseChange={handleLicenseChange}
        validationErrors={validationErrors}
        nameAvailabilityResults={nameAvailabilityResults}
        isCheckingAvailability={isCheckingAvailability}
      />
    {:else if currentStep === 3}
      <AdvancedSettingsStep
        gitignoreTemplate={advancedSettings.gitignoreTemplate}
        licenseTemplate={advancedSettings.licenseTemplate}
        defaultBranch={advancedSettings.defaultBranch}
        authorName={advancedSettings.authorName}
        authorEmail={advancedSettings.authorEmail}
        maintainers={advancedSettings.maintainers}
        relays={advancedSettings.relays}
        tags={advancedSettings.tags}
        webUrl={advancedSettings.webUrl}
        cloneUrl={advancedSettings.cloneUrl}
        onGitignoreChange={handleGitignoreChange}
        onLicenseChange={handleLicenseChange}
        onDefaultBranchChange={handleDefaultBranchChange}
        onAuthorNameChange={handleAuthorNameChange}
        onAuthorEmailChange={handleAuthorEmailChange}
        onMaintainersChange={handleMaintainersChange}
        onRelaysChange={handleRelaysChange}
        onTagsChange={handleTagsChange}
        onWebUrlChange={handleWebUrlChange}
        onCloneUrlChange={handleCloneUrlChange}
      />
    {:else if currentStep === 4}
      <RepoProgressStep
        isCreating={isCreating()}
        progress={progressSteps}
        onRetry={handleRetry}
        onClose={handleClose}
      />
    {/if}
  </div>

  <!-- Navigation Buttons -->
  {#if currentStep < 4}
    <div class="flex justify-between pt-4">
      <Button
        onclick={onCancel}
        variant="outline"
        size="sm"
        class="h-8 px-3 py-0 text-xs font-medium rounded-md border bg-background hover:bg-muted transition"
      >
        Cancel
      </Button>
      
      <div class="flex space-x-3">
        {#if currentStep > 1}
          <Button
            onclick={prevStep}
            variant="outline"
            size="sm"
            class="h-8 px-3 py-0 text-xs font-medium rounded-md border bg-background hover:bg-muted transition"
          >
            Previous
          </Button>
        {/if}
        
        <Button
          onclick={nextStep}
          disabled={
            (currentStep === 1 && (!selectedProvider || (selectedProvider === 'grasp' && !isValidGraspConfig()))) ||
            (currentStep === 2 && !validateStep1())
          }
          variant="git"
          size="sm"
          class="h-8 px-3 py-0 text-xs font-medium rounded-md transition"
        >
          {currentStep === 3 ? 'Create Repository' : 'Next'}
        </Button>
      </div>
    </div>
  {/if}
</div>
