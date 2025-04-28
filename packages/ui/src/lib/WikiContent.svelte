<script lang="ts">
    import { Plus } from "@lucide/svelte";
    import { Card } from '$lib/shadcdn';
  
    export let pageName: string;
  
    /* ---------- mock wiki DB ---------- */
    import HomeContent           from './wiki/HomeContent.svx';      // .svx (md-svx) works great
    import GettingStartedContent from './wiki/GettingStarted.svx';
    import GitIntegrationContent from './wiki/GitIntegration.svx';
    import NostrContent          from './wiki/NostrProtocol.svx';
  
    const wikiContent: Record<string, typeof HomeContent> = {
      'Home':            HomeContent,
      'Getting Started': GettingStartedContent,
      'Git Integration': GitIntegrationContent,
      'Nostr Protocol':  NostrContent
    };
  </script>
  
  <Card class="p-6">
    {#if wikiContent[pageName]}
      <svelte:component this={wikiContent[pageName]} />
    {:else}
      <div class="flex flex-col items-center justify-center py-12">
        <div class="text-6xl mb-4">📝</div>
        <h2 class="text-xl font-semibold mb-2">Page not found</h2>
        <p class="text-muted-foreground mb-6">
          The wiki page &quot;{pageName}&quot; does not exist yet.
        </p>
  
        <button class="git-btn git-btn-primary flex items-center gap-2">
          <Plus class="h-4 w-4" /> Create this page
        </button>
      </div>
    {/if}
  </Card>
  