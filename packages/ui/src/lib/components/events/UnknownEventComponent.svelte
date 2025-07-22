<!--
  UnknownEventComponent.svelte
  Fallback component for unknown or unsupported Nostr event kinds
  Provides basic event information with Svelte 5 reactivity
-->
<script lang="ts">
  import { nip19, type NostrEvent } from 'nostr-tools';
  import { onMount } from 'svelte';
  import { HelpCircle, Copy, Hash } from '@lucide/svelte';

  interface Props {
    event: NostrEvent;
    relays?: string[];
    showRawData?: boolean;
  }

  let { event, relays = [], showRawData = false }: Props = $props();

  // Reactive state using Svelte 5 runes
  let authorNpub = $state('');
  let eventId = $state('');
  let expandedRaw = $state(false);

  // Derived computed values
  const shortNpub = $derived(authorNpub ? authorNpub.slice(0, 16) + '...' : '');
  const shortEventId = $derived(eventId ? eventId.slice(0, 16) + '...' : '');
  const eventContent = $derived(event.content || '');
  const createdDate = $derived(new Date(event.created_at * 1000));
  const formattedDate = $derived(
    createdDate.toLocaleDateString() + ' ' + createdDate.toLocaleTimeString()
  );
  const tagCount = $derived(event.tags?.length || 0);

  // Parse event data
  const parseEventData = () => {
    // Generate npub from pubkey
    if (event.pubkey) {
      try {
        authorNpub = nip19.npubEncode(event.pubkey);
      } catch (error) {
        console.warn('Failed to encode npub:', error);
        authorNpub = event.pubkey.slice(0, 16) + '...';
      }
    }

    // Set event ID
    eventId = event.id || '';
  };

  // Effect to handle event updates
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

  // Toggle raw data view
  const toggleRawData = () => {
    expandedRaw = !expandedRaw;
  };

  onMount(() => {
    // Initialize component
    parseEventData();
  });
</script>

<div class="unknown-event border-l-4 border-yellow-500 bg-yellow-50 p-4 rounded-r-lg">
  <div class="flex items-start gap-3">
    <HelpCircle class="text-yellow-600 mt-1" size={20} />
    
    <div class="flex-1">
      <div class="flex items-center gap-2 mb-2">
        <h3 class="font-semibold text-lg text-gray-900">
          Unknown Event Kind {event.kind}
        </h3>
        <span class="text-sm text-yellow-800 bg-yellow-200 px-2 py-1 rounded">
          Kind {event.kind}
        </span>
      </div>

      {#if eventContent}
        <div class="prose prose-sm max-w-none mb-3">
          <div class="bg-gray-50 p-3 rounded border">
            <p class="text-gray-800 whitespace-pre-wrap">{eventContent}</p>
          </div>
        </div>
      {/if}

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600">Author:</span>
          <span class="text-sm text-yellow-700 font-mono">{shortNpub}</span>
          <button 
            type="button"
            onclick={() => copyToClipboard(event.pubkey)}
            class="text-yellow-600 hover:text-yellow-800 text-sm"
            title="Copy pubkey">
            <Copy size={16} />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600">Event ID:</span>
          <code class="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
            {shortEventId}
          </code>
          <button 
            type="button"
            onclick={() => copyToClipboard(eventId)}
            class="text-yellow-600 hover:text-yellow-800 text-sm"
            title="Copy full event ID">
            <Copy size={16} />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600">Tags:</span>
          <span class="text-sm text-gray-700">
            {tagCount} tag{tagCount !== 1 ? 's' : ''}
          </span>
        </div>

        {#if event.tags && event.tags.length > 0}
          <div class="flex items-start gap-2">
            <span class="text-sm font-medium text-gray-600">Tag preview:</span>
            <div class="flex gap-1 flex-wrap">
              {#each event.tags.slice(0, 3) as tag}
                <span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">
                  {tag[0]}{tag[1] ? `: ${tag[1].slice(0, 20)}${tag[1].length > 20 ? '...' : ''}` : ''}
                </span>
              {/each}
              {#if event.tags.length > 3}
                <span class="text-xs text-gray-500">
                  +{event.tags.length - 3} more
                </span>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="mt-3 flex items-center justify-between">
        <div class="text-xs text-gray-500">
          Created {formattedDate}
        </div>
        
        <button
          type="button"
          onclick={toggleRawData}
          class="text-xs text-yellow-600 hover:text-yellow-800 underline">
          {expandedRaw ? 'Hide' : 'Show'} Raw Data
        </button>
      </div>

      {#if expandedRaw}
        <div class="mt-3 bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-x-auto">
          <pre>{JSON.stringify(event, null, 2)}</pre>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .unknown-event {
    /* Custom styling for unknown events */
    transition: all 0.2s ease-in-out;
  }
  
  .unknown-event:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .prose {
    /* Ensure content is properly formatted */
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  pre {
    /* JSON formatting */
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 300px;
    overflow-y: auto;
  }
</style>
