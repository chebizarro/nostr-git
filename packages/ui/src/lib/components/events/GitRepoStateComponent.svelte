<script lang="ts">
  import { nip19, type NostrEvent } from 'nostr-tools';
  import { onMount } from 'svelte';
  import { GitBranch, Copy } from '@lucide/svelte';

  interface Props {
    event: NostrEvent;
  }

  let { event }: Props = $props();

  let repoId = $state('');
  let cloneUrl = $state('');
  let authorNpub = $state('');
  let headCommit = $state('');
  let branches = $state<string[]>([]);
  let tags = $state<string[]>([]);
  let lastUpdate = $state<Date | null>(null);

  // Derived computed values
  const displayId = $derived(repoId || 'Unknown Repository');
  const shortNpub = $derived(authorNpub ? authorNpub.slice(0, 16) + '...' : '');
  const shortCommit = $derived(headCommit ? headCommit.slice(0, 8) : '');
  const formattedDate = $derived(
    lastUpdate ? lastUpdate.toLocaleDateString() + ' ' + lastUpdate.toLocaleTimeString() : ''
  );

  const parseEventData = () => {
    const eventTags = event.tags || [];
    
    for (const tag of eventTags) {
      switch (tag[0]) {
        case 'd':
          repoId = tag[1] || '';
          break;
        case 'clone':
          cloneUrl = tag[1] || '';
          break;
        case 'head':
          headCommit = tag[1] || '';
          break;
        case 'branch':
          if (tag[1] && !branches.includes(tag[1])) {
            branches = [...branches, tag[1]];
          }
          break;
        case 'tag':
          if (tag[1] && !tags.includes(tag[1])) {
            tags = [...tags, tag[1]];
          }
          break;
      }
    }

    // Generate npub from pubkey
    if (event.pubkey) {
      try {
        authorNpub = nip19.npubEncode(event.pubkey);
      } catch (error) {
        console.warn('Failed to encode npub:', error);
        authorNpub = event.pubkey.slice(0, 16) + '...';
      }
    }

    // Set last update time
    lastUpdate = new Date(event.created_at * 1000);
  };

  // Effect to handle event updates and Nostr event streams
  $effect(() => {
    if (event) {
      parseEventData();
    }
  });

  // Handle copy to clipboard functionality
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Could integrate with toast system here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  onMount(() => {
    // Initialize component
    parseEventData();
  });
</script>

<div class="git-repo-state-event border-l-4 border-green-500 bg-green-50 p-4 rounded-r-lg">
  <div class="flex items-start gap-3">
    <GitBranch class="text-green-600 mt-1" size={20} />
    
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
        <h3 class="font-semibold text-lg text-gray-900">
          Repository State: {displayId}
        </h3>
        <span class="text-sm text-gray-500 bg-gray-200 px-2 py-1 rounded">
          State Update
        </span>
      </div>

      {#if event.content}
        <p class="text-gray-700 mb-3">{event.content}</p>
      {/if}

      <div class="space-y-2">
        {#if cloneUrl}
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-600">Clone URL:</span>
            <code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono flex-1">
              {cloneUrl}
            </code>
            <button 
              type="button"
              onclick={() => copyToClipboard(cloneUrl)}
              class="text-green-600 hover:text-green-800 text-sm p-1"
              title="Copy clone URL">
              <Copy size={16} />
            </button>
          </div>
        {/if}

        {#if headCommit}
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-600">HEAD:</span>
            <code class="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
              {shortCommit}
            </code>
            <button 
              type="button"
              onclick={() => copyToClipboard(headCommit)}
              class="text-green-600 hover:text-green-800 text-sm p-1"
              title="Copy full commit hash">
              <Copy size={16} />
            </button>
          </div>
        {/if}

        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600">Author:</span>
          <span class="text-sm text-green-600 font-mono">{shortNpub}</span>
        </div>

        {#if branches.length > 0}
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-600">Branches:</span>
            <div class="flex gap-1 flex-wrap">
              {#each branches.slice(0, 5) as branch}
                <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                  {branch}
                </span>
              {/each}
              {#if branches.length > 5}
                <span class="text-xs text-gray-500">
                  +{branches.length - 5} more
                </span>
              {/if}
            </div>
          </div>
        {/if}

        {#if tags.length > 0}
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-600">Tags:</span>
            <div class="flex gap-1 flex-wrap">
              {#each tags.slice(0, 3) as tag}
                <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {tag}
                </span>
              {/each}
              {#if tags.length > 3}
                <span class="text-xs text-gray-500">
                  +{tags.length - 3} more
                </span>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="mt-3 text-xs text-gray-500">
        Last updated {formattedDate}
      </div>
    </div>
  </div>
</div>

<style>
  .git-repo-state-event {
    /* Custom styling for git repository state events */
    transition: all 0.2s ease-in-out;
  }
  
  .git-repo-state-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
</style>
