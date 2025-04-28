<script lang="ts">
    import { onMount } from 'svelte';
    import { Separator }  from '$lib/shadcdn';
    import ThreadMessage  from '$lib/components/thread/ThreadMessage.svelte';
    import ThreadCommit   from '$lib/components/thread/ThreadCommit.svelte';
    import ThreadPatch    from '$lib/components/thread/ThreadPatch.svelte';
    import ThreadIssue    from '$lib/components/thread/ThreadIssue.svelte';
    import ThreadComposer from '$lib/components/thread/ThreadComposer.svelte';
  
    const {
      repoId
    }: {
      repoId: string;
    } = $props();
  
    type EventType = 'message' | 'commit' | 'issue' | 'patch';
  
    interface ThreadEvent {
      id: string;
      type: EventType;
      content: string;
      author: { name: string; avatar: string };
      createdAt: string;
      metadata?: Record<string, unknown>;
    }
  
    let events: ThreadEvent[] = /* same mock array as original */ [
    const events: ThreadEvent[] = /* same mock array as original */ [
      /* … abbreviated for brevity … */
    ];
  
    const handleSubmit = (msg: string) => {
      console.log('New message:', msg);
    };
  </script>
  
  <!-- layout -->
  <div class="flex flex-col h-full">
    <div class="flex-1 overflow-y-auto px-4 py-2 space-y-2">
      {#each events as e (e.id)}
        {#if e.type === 'message'}
          <ThreadMessage {...e} />
        {:else if e.type === 'commit'}
          <ThreadCommit {...e} />
        {:else if e.type === 'patch'}
          <ThreadPatch repoId={repoId} {...e} />
        {:else if e.type === 'issue'}
          <ThreadIssue repoId={repoId} {...e} />
        {/if}
  
        <Separator class="my-2" />
      {/each}
    </div>
  
    <div class="mt-auto border-t p-4 bg-background">
      <ThreadComposer on:submit={(ev) => handleSubmit(ev.detail)} />
    </div>
  </div>
  