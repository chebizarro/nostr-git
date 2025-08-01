<script lang="ts">
  import RepoDetailsStep from './RepoDetailsStep.svelte';
  import AdvancedSettingsStep from './AdvancedSettingsStep.svelte';
  import RepoProgressStep from './RepoProgressStep.svelte';
  import { type Event as NostrEvent } from 'nostr-tools';
  import { useRegistry } from '../../useRegistry';
  import { useNewRepo, type NewRepoResult } from '$lib/useNewRepo.svelte';
  
  const { Button } = useRegistry();

  interface Props {
    onRepoCreated?: (repoData: NewRepoResult) => void;
    onCancel?: () => void;
    onPublishEvent?: (event: Omit<NostrEvent, 'id' | 'sig' | 'pubkey' | 'created_at'>) => Promise<void>;
  }

  const { onRepoCreated, onCancel, onPublishEvent }: Props = $props();

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

  // Step management
  let currentStep = $state(1);
  const totalSteps = 3;

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
    if (currentStep === 1 && validateStep1()) {
      currentStep = 2;
    } else if (currentStep === 2) {
      currentStep = 3;
      startRepositoryCreation();
    }
  }

  function prevStep() {
    if (currentStep === 2) {
      currentStep = 1;
    } else if (currentStep === 3 && !isCreating) {
      currentStep = 2;
    }
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

<div class="max-w-4xl mx-auto p-6 space-y-6">
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
      <span class="text-sm font-medium text-foreground">Repository Details</span>
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
      <span class="text-sm font-medium text-foreground">Advanced Settings</span>
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
      <span class="text-sm font-medium text-foreground">Create Repository</span>
    </div>
  </div>

  <!-- Step Content -->
  <div class="bg-card text-card-foreground rounded-lg border shadow-sm p-6">
    {#if currentStep === 1}
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
      />
    {:else if currentStep === 2}
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
    {:else if currentStep === 3}
      <RepoProgressStep
        isCreating={isCreating()}
        progress={progressSteps}
        onRetry={handleRetry}
        onClose={handleClose}
      />
    {/if}
  </div>

  <!-- Navigation Buttons -->
  {#if currentStep < 3}
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
          disabled={currentStep === 1 && !validateStep1()}
          variant="git"
          size="sm"
          class="h-8 px-3 py-0 text-xs font-medium rounded-md transition"
        >
          {currentStep === 2 ? 'Create Repository' : 'Next'}
        </Button>
      </div>
    </div>
  {/if}
</div>
