<script lang="ts">
  /* -------------------------------------------------------------------------------------------------
   * RepoHeader – Git repository top bar
   * ------------------------------------------------------------------------------------------------*/

  // SvelteKit helpers --------------------------------------------------------
  // Removed SvelteKit-specific import of 'page' from '$app/stores'.
  import { derived } from "svelte/store";

  // Your UI primitives -------------------------------------------------------
  import { Button, Tabs, TabsList, TabsTrigger } from "$lib/components";

  // Icons (lucide-svelte) ----------------------------------------------------
  import {
    GitBranch,
    Star,
    Eye,
    GitFork,
    FileCode,
    CircleAlert,
    GitPullRequest,
    Book,
  } from "@lucide/svelte";

  /* Props ------------------------------------------------------------------ */
  // Type definition for Repo (if not globally available)
  type Repo = {
    id: string;
    name: string;
    description?: string;
    owner?: { name: string; avatar: string };
    stars?: number;
    forks?: number;
    watchers?: number;
    contributors?: { name: string; avatar: string }[];
    // Add more fields as needed
  };

  const props = $props();
  const repo: Repo | undefined = props.repo;
  let activeTab = $state(props.activeTab ?? "code");

  // For now, set repoId from props or another source:
  const repoId = repo?.id ?? "";

  /* Helpers -----------------------------------------------------------------*/
  const navBase = (tab: string, id: string) => `/git/repo/${id}/${tab}`;

  function handleTabChange(tab: string) {
    if (repoId) {
      window.location.href = navBase(tab, repoId);
    }
  }
</script>

<!-- -------------------------------------------------------------------------------------------------
       MARKUP
  --------------------------------------------------------------------------------------------------- -->
<div class="border-b border-border pb-4">
  <!-- Title / action buttons ------------------------------------------------>
  <div class="flex items-center justify-between mb-4 flex-wrap gap-4">
    <h1 class="text-2xl font-bold flex items-center gap-2">
      <GitBranch class="h-6 w-6" />
      {repo?.name ?? "Unknown Repo"}
    </h1>

    <div class="flex items-center gap-2 shrink-0">
      <Button variant="outline" size="sm" class="gap-2">
        <Star class="h-4 w-4" /> Star
      </Button>
      <Button variant="outline" size="sm" class="gap-2">
        <Eye class="h-4 w-4" /> Watch
      </Button>
      <Button variant="outline" size="sm" class="gap-2">
        <GitFork class="h-4 w-4" /> Fork
      </Button>
      {#if repo?.contributors && repo.contributors.length > 5}
        <Button variant="outline" size="sm" class="ml-2 h-8">
          +{repo.contributors.length - 5} more
        </Button>
      {/if}
    </div>
  </div>

  <!-- Description ----------------------------------------------------------->
  {#if repo?.description}
    <p class="text-muted-foreground mb-4">{repo.description}</p>
  {/if}

  <!-- Tabs ------------------------------------------------------------------>
  <Tabs
    class="w-full"
    onchange={(e) => {
      const target = e.target as HTMLInputElement | HTMLElement | null;
      const value =
        (target as HTMLInputElement)?.value ?? target?.getAttribute?.("data-value") ?? undefined;
      handleTabChange(value);
    }}
  >
    <TabsList class="grid grid-cols-6 mb-0">
      <TabsTrigger value="overview">
        <span class="flex items-center gap-2">
          <FileCode class="h-4 w-4" /> Overview
        </span>
      </TabsTrigger>

      <TabsTrigger value="code">
        <span class="flex items-center gap-2">
          <GitBranch class="h-4 w-4" /> Code
        </span>
      </TabsTrigger>

      <TabsTrigger value="issues">
        <span class="flex items-center gap-2">
          <CircleAlert class="h-4 w-4" /> Issues
        </span>
      </TabsTrigger>

      <TabsTrigger value="patches">
        <span class="flex items-center gap-2">
          <GitPullRequest class="h-4 w-4" /> Patches
        </span>
      </TabsTrigger>

      <TabsTrigger value="wiki">
        {#if repoId}
          <a class="flex items-center gap-2" href={navBase("wiki", repoId)}>
            <Book class="h-4 w-4" /> Wiki
          </a>
        {/if}
      </TabsTrigger>

      <TabsTrigger value="live">
        {#if repoId}
          <a class="flex items-center gap-2" href={navBase("live", repoId)}>
            <!-- green “live” indicator -->
            <span class="relative flex h-2 w-2 mr-1">
              <span
                class="animate-pulse-git absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
              ></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live&nbsp;Session
            <span class="font-medium">{repo?.watchers ?? 0} watching</span>
          </a>
        {/if}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</div>
