<script lang="ts">
    /* -------------------------------------------------------------------------------------------------
     * RepoHeader – Git repository top bar
     * ------------------------------------------------------------------------------------------------*/
  
    // SvelteKit helpers --------------------------------------------------------
    import { page } from '$app/stores';
    import { derived } from 'svelte/store';
  
    // Your UI primitives -------------------------------------------------------
    import Button        from '$lib/components/ui/Button.svelte';
    import Tabs          from '$lib/components/ui/Tabs/Tabs.svelte';
    import TabsList      from '$lib/components/ui/Tabs/TabsList.svelte';
    import TabsTrigger   from '$lib/components/ui/Tabs/TabsTrigger.svelte';
  
    // Icons (lucide-svelte) ----------------------------------------------------
    import { 
      GitBranch, Star, Eye, GitFork, FileCode, CircleAlert, 
      GitPullRequest, Book 
    } from 'lucide-svelte';
  
    /* Props ------------------------------------------------------------------ */
    const {
      repo,
      activeTab = 'code'
    }: {
      repo: Repo;
      activeTab?: string;
    } = $props();

    function setTab(tab: string) {
      activeTab = tab;
    }
  
    /* URL / params ------------------------------------------------------------*/
    const repoId = $derived(page, $p => $p.params.repoId ?? '');
  
    /* Helpers -----------------------------------------------------------------*/
    const navBase = (tab: string, id: string) => `/git/repo/${id}/${tab}`;
  </script>
  
  <!-- -------------------------------------------------------------------------------------------------
       MARKUP
  --------------------------------------------------------------------------------------------------- -->
  <div class="border-b border-border pb-4">
    <!-- Title / action buttons ------------------------------------------------>
    <div class="flex items-center justify-between mb-4 flex-wrap gap-4">
      <h1 class="text-2xl font-bold flex items-center gap-2">
        <GitBranch class="h-6 w-6" />
        {name}
      </h1>
  
      <div class="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" class="gap-2">
          <Star  class="h-4 w-4" /> Star
        </Button>
        <Button variant="outline" size="sm" class="gap-2">
          <Eye   class="h-4 w-4" /> Watch
        </Button>
        <Button variant="outline" size="sm" class="gap-2">
          <GitFork class="h-4 w-4" /> Fork
        </Button>
      </div>
    </div>
  
    <!-- Description ----------------------------------------------------------->
    {#if description}
      <p class="text-muted-foreground mb-4">{description}</p>
    {/if}
  
    <!-- Tabs ------------------------------------------------------------------>
    <Tabs {activeTab} class="w-full">
      <TabsList class="grid grid-cols-6 mb-0">
        <TabsTrigger value="overview" let:isActive>
          {#if $repoId}
            <a class="flex items-center gap-2" href={navBase('overview', $repoId)}>
              <FileCode class="h-4 w-4" />
              Overview
            </a>
          {/if}
        </TabsTrigger>
  
        <TabsTrigger value="code">
          {#if $repoId}
            <a class="flex items-center gap-2" href={navBase('code', $repoId)}>
              <GitBranch class="h-4 w-4" /> Code
            </a>
          {/if}
        </TabsTrigger>
  
        <TabsTrigger value="issues">
          {#if $repoId}
            <a class="flex items-center gap-2" href={navBase('issues', $repoId)}>
              <CircleAlert class="h-4 w-4" /> Issues
            </a>
          {/if}
        </TabsTrigger>
  
        <TabsTrigger value="patches">
          {#if $repoId}
            <a class="flex items-center gap-2" href={navBase('patches', $repoId)}>
              <GitPullRequest class="h-4 w-4" /> Patches
            </a>
          {/if}
        </TabsTrigger>
  
        <TabsTrigger value="wiki">
          {#if $repoId}
            <a class="flex items-center gap-2" href={navBase('wiki', $repoId)}>
              <Book class="h-4 w-4" /> Wiki
            </a>
          {/if}
        </TabsTrigger>
  
        <TabsTrigger value="live">
          {#if $repoId}
            <a class="flex items-center gap-2" href={navBase('live', $repoId)}>
              <!-- green “live” indicator -->
              <span class="relative flex h-2 w-2 mr-1">
                <span class="animate-pulse-git absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live&nbsp;Session
            </a>
          {/if}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
  