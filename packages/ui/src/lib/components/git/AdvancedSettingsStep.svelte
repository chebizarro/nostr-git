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
    <h2 class="text-xl font-semibold text-gray-100">
      Advanced Settings
    </h2>
    <p class="text-sm text-gray-300">
      Configure additional options for your repository.
    </p>
  </div>

  <div class="space-y-6">
    <!-- Author Information -->
    <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
      <h3 class="text-lg font-medium text-gray-100 mb-4">Author Information</h3>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label for="author-name" class="block text-sm font-medium text-gray-300 mb-2">
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
          <label for="author-email" class="block text-sm font-medium text-gray-300 mb-2">
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
      <h3 class="text-lg font-medium text-gray-100 mb-4">Repository Metadata (NIP-34)</h3>
      
      <div class="space-y-4">
        <!-- Web URL -->
        <div>
          <label for="web-url" class="block text-sm font-medium text-gray-300 mb-2">
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
          <p class="mt-1 text-sm text-gray-400">
            URL for browsing the repository online
          </p>
        </div>

        <!-- Clone URL -->
        <div>
          <label for="clone-url" class="block text-sm font-medium text-gray-300 mb-2">
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
          <p class="mt-1 text-sm text-gray-400">
            Git clone URL for the repository
          </p>
        </div>

        <!-- Tags -->
        <div>
          <label for="tags" class="block text-sm font-medium text-gray-300 mb-2">
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
          <p class="mt-1 text-sm text-gray-400">
            Comma-separated list of tags or topics for this repository
          </p>
        </div>

        <!-- Maintainers -->
        <div>
          <label for="maintainers" class="block text-sm font-medium text-gray-300 mb-2">
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
          <p class="mt-1 text-sm text-gray-400">
            Comma-separated list of additional maintainer public keys (npub format)
          </p>
        </div>

        <!-- Relays -->
        <div>
          <label for="relays" class="block text-sm font-medium text-gray-300 mb-2">
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
          <p class="mt-1 text-sm text-gray-400">
            Comma-separated list of preferred relay URLs for this repository
          </p>
        </div>
      </div>
    </div>

  </div>
</div>
