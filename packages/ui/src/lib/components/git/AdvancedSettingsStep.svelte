<script lang="ts">
  interface Props {
    gitignoreTemplate: string;
    licenseTemplate: string;
    defaultBranch: string;
    authorName: string;
    authorEmail: string;
    maintainers: string[];
    relays: string[];
    tags: string[];
    webUrl: string;
    cloneUrl: string;
    onGitignoreChange: (template: string) => void;
    onLicenseChange: (template: string) => void;
    onDefaultBranchChange: (branch: string) => void;
    onAuthorNameChange: (name: string) => void;
    onAuthorEmailChange: (email: string) => void;
    onMaintainersChange: (maintainers: string[]) => void;
    onRelaysChange: (relays: string[]) => void;
    onTagsChange: (tags: string[]) => void;
    onWebUrlChange: (url: string) => void;
    onCloneUrlChange: (url: string) => void;
  }

  const {
    gitignoreTemplate,
    licenseTemplate,
    defaultBranch,
    authorName,
    authorEmail,
    maintainers,
    relays,
    tags,
    webUrl,
    cloneUrl,
    onGitignoreChange,
    onLicenseChange,
    onDefaultBranchChange,
    onAuthorNameChange,
    onAuthorEmailChange,
    onMaintainersChange,
    onRelaysChange,
    onTagsChange,
    onWebUrlChange,
    onCloneUrlChange
  }: Props = $props();

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
</script>

<div class="space-y-6">
  <div class="space-y-4">
    <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
      Advanced Settings
    </h2>
    <p class="text-sm text-gray-600 dark:text-gray-400">
      Configure additional options for your repository.
    </p>
  </div>

  <div class="space-y-6">
    <!-- Author Information -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Author Information</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="author-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Author Name *
          </label>
          <input
            id="author-name"
            type="text"
            value={authorName}
            oninput={(e) => onAuthorNameChange((e.target as HTMLInputElement).value)}
            placeholder="Your full name"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
            required
          />
        </div>
        
        <div>
          <label for="author-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Author Email *
          </label>
          <input
            id="author-email"
            type="email"
            value={authorEmail}
            oninput={(e) => onAuthorEmailChange((e.target as HTMLInputElement).value)}
            placeholder="your.email@example.com"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
            required
          />
        </div>
      </div>
    </div>

    <!-- NIP-34 Repository Metadata -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Repository Metadata (NIP-34)</h3>
      
      <div class="space-y-4">
        <!-- Web URL -->
        <div>
          <label for="web-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Web URL
          </label>
          <input
            id="web-url"
            type="url"
            value={webUrl}
            oninput={(e) => onWebUrlChange((e.target as HTMLInputElement).value)}
            placeholder="https://github.com/user/repo"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            URL for browsing the repository online
          </p>
        </div>

        <!-- Clone URL -->
        <div>
          <label for="clone-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Clone URL
          </label>
          <input
            id="clone-url"
            type="url"
            value={cloneUrl}
            oninput={(e) => onCloneUrlChange((e.target as HTMLInputElement).value)}
            placeholder="https://github.com/user/repo.git"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Git clone URL for the repository
          </p>
        </div>

        <!-- Tags -->
        <div>
          <label for="tags" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tags/Topics
          </label>
          <input
            id="tags"
            type="text"
            value={tags.join(', ')}
            oninput={(e) => onTagsChange((e.target as HTMLInputElement).value.split(',').map(tag => tag.trim()).filter(tag => tag))}
            placeholder="javascript, svelte, web-development"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Comma-separated list of tags or topics for this repository
          </p>
        </div>

        <!-- Maintainers -->
        <div>
          <label for="maintainers" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Additional Maintainers
          </label>
          <input
            id="maintainers"
            type="text"
            value={maintainers.join(', ')}
            oninput={(e) => onMaintainersChange((e.target as HTMLInputElement).value.split(',').map(key => key.trim()).filter(key => key))}
            placeholder="npub1abc..., npub1def..."
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Comma-separated list of additional maintainer public keys (npub format)
          </p>
        </div>

        <!-- Relays -->
        <div>
          <label for="relays" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Preferred Relays
          </label>
          <input
            id="relays"
            type="text"
            value={relays.join(', ')}
            oninput={(e) => onRelaysChange((e.target as HTMLInputElement).value.split(',').map(relay => relay.trim()).filter(relay => relay))}
            placeholder="wss://relay1.example.com, wss://relay2.example.com"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Comma-separated list of preferred relay URLs for this repository
          </p>
        </div>
      </div>
    </div>

    <!-- Information Box -->
    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="ml-3">
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
            About these settings
          </h3>
          <div class="mt-2 text-sm text-blue-700 dark:text-blue-300">
            <ul class="list-disc list-inside space-y-1">
              <li>You can change these settings later in your repository</li>
              <li>The .gitignore file helps keep unwanted files out of your repository</li>
              <li>Adding a license helps others understand how they can use your code</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
