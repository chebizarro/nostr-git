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
    webUrls: string[];
    cloneUrls: string[];
    onGitignoreChange: (template: string) => void;
    onLicenseChange: (template: string) => void;
    onDefaultBranchChange: (branch: string) => void;
    onAuthorNameChange: (name: string) => void;
    onAuthorEmailChange: (email: string) => void;
    onMaintainersChange: (maintainers: string[]) => void;
    onRelaysChange: (relays: string[]) => void;
    onTagsChange: (tags: string[]) => void;
    onWebUrlsChange: (urls: string[]) => void;
    onCloneUrlsChange: (urls: string[]) => void;
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
    webUrls,
    cloneUrls,
    onGitignoreChange,
    onLicenseChange,
    onDefaultBranchChange,
    onAuthorNameChange,
    onAuthorEmailChange,
    onMaintainersChange,
    onRelaysChange,
    onTagsChange,
    onWebUrlsChange,
    onCloneUrlsChange
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

  // Helpers for multi-value fields
  function addItem(arr: string[], onChange: (v: string[]) => void) {
    onChange([...(arr || []), '']);
  }
  function removeItem(arr: string[], index: number, onChange: (v: string[]) => void) {
    onChange((arr || []).filter((_, i) => i !== index));
  }
  function updateItem(arr: string[], index: number, value: string, onChange: (v: string[]) => void) {
    onChange((arr || []).map((item, i) => (i === index ? value : item)));
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
        <!-- Web URLs -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Web URLs
          </label>
          <div class="space-y-2">
            {#each webUrls as url, index}
              <div class="flex items-center space-x-2">
                <input
                  type="url"
                  value={webUrls[index]}
                  oninput={(e) => updateItem(webUrls, index, (e.target as HTMLInputElement).value, onWebUrlsChange)}
                  placeholder="https://github.com/user/repo"
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <button type="button" class="p-2 text-red-400 hover:text-red-300" aria-label="Remove web URL" onclick={() => removeItem(webUrls, index, onWebUrlsChange)}>
                  Remove
                </button>
              </div>
            {/each}
            <button type="button" class="px-3 py-2 text-blue-400 hover:text-blue-300" onclick={() => addItem(webUrls, onWebUrlsChange)}>
              Add web URL
            </button>
          </div>
          <p class="mt-1 text-sm text-gray-400">
            URL(s) for browsing the repository online
          </p>
        </div>

        <!-- Clone URLs -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Clone URLs
          </label>
          <div class="space-y-2">
            {#each cloneUrls as url, index}
              <div class="flex items-center space-x-2">
                <input
                  type="url"
                  value={cloneUrls[index]}
                  oninput={(e) => updateItem(cloneUrls, index, (e.target as HTMLInputElement).value, onCloneUrlsChange)}
                  placeholder="https://github.com/user/repo.git"
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <button type="button" class="p-2 text-red-400 hover:text-red-300" aria-label="Remove clone URL" onclick={() => removeItem(cloneUrls, index, onCloneUrlsChange)}>
                  Remove
                </button>
              </div>
            {/each}
            <button type="button" class="px-3 py-2 text-blue-400 hover:text-blue-300" onclick={() => addItem(cloneUrls, onCloneUrlsChange)}>
              Add clone URL
            </button>
          </div>
          <p class="mt-1 text-sm text-gray-400">
            Git clone URL(s) for the repository
          </p>
        </div>

        <!-- Tags -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Tags/Topics
          </label>
          <div class="space-y-2">
            {#each tags as tag, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  value={tags[index]}
                  oninput={(e) => updateItem(tags, index, (e.target as HTMLInputElement).value, onTagsChange)}
                  placeholder="javascript"
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <button type="button" class="p-2 text-red-400 hover:text-red-300" aria-label="Remove tag" onclick={() => removeItem(tags, index, onTagsChange)}>
                  Remove
                </button>
              </div>
            {/each}
            <button type="button" class="px-3 py-2 text-blue-400 hover:text-blue-300" onclick={() => addItem(tags, onTagsChange)}>
              Add tag
            </button>
          </div>
          <p class="mt-1 text-sm text-gray-400">
            Add tags or topics for this repository
          </p>
        </div>

        <!-- Maintainers -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Additional Maintainers
          </label>
          <div class="space-y-2">
            {#each maintainers as m, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  value={maintainers[index]}
                  oninput={(e) => updateItem(maintainers, index, (e.target as HTMLInputElement).value, onMaintainersChange)}
                  placeholder="npub1..."
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <button type="button" class="p-2 text-red-400 hover:text-red-300" aria-label="Remove maintainer" onclick={() => removeItem(maintainers, index, onMaintainersChange)}>
                  Remove
                </button>
              </div>
            {/each}
            <button type="button" class="px-3 py-2 text-blue-400 hover:text-blue-300" onclick={() => addItem(maintainers, onMaintainersChange)}>
              Add maintainer
            </button>
          </div>
          <p class="mt-1 text-sm text-gray-400">
            Maintainer public keys (npub or hex)
          </p>
        </div>

        <!-- Relays -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Preferred Relays
          </label>
          <div class="space-y-2">
            {#each relays as r, index}
              <div class="flex items-center space-x-2">
                <input
                  type="text"
                  value={relays[index]}
                  oninput={(e) => updateItem(relays, index, (e.target as HTMLInputElement).value, onRelaysChange)}
                  placeholder="wss://relay.example.com"
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100"
                />
                <button type="button" class="p-2 text-red-400 hover:text-red-300" aria-label="Remove relay" onclick={() => removeItem(relays, index, onRelaysChange)}>
                  Remove
                </button>
              </div>
            {/each}
            <button type="button" class="px-3 py-2 text-blue-400 hover:text-blue-300" onclick={() => addItem(relays, onRelaysChange)}>
              Add relay
            </button>
          </div>
          <p class="mt-1 text-sm text-gray-400">
            Preferred relay URLs (wss://)
          </p>
        </div>
      </div>
    </div>

  </div>
</div>
