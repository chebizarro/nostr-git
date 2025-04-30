<script lang="ts">
  let { name, description, activeTab, repoId } = $props();

  import { Button, Tabs, TabsList, TabsTrigger } from "$lib/components";
  import {
    GitBranch, Star, Eye, GitFork, FileCode, CircleAlert, GitPullRequest, Book
  } from "@lucide/svelte";
</script>

<!-- -------------------------------------------------------------------------------------------------
       MARKUP
  --------------------------------------------------------------------------------------------------- -->
<div class="border-b border-border pb-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold flex items-center gap-2">
      <GitBranch class="h-6 w-6" />
      {name}
    </h1>
    
    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" class="gap-2">
        <Star class="h-4 w-4" />
        Star
      </Button>
            <Button variant="outline" size="sm" class="gap-2">
        <Eye class="h-4 w-4" />
        Watch
      </Button>
      <Button variant="outline" size="sm" class="gap-2">
        <GitFork class="h-4 w-4" />
        Fork
      </Button>
    </div>
  </div>
  <p class="text-muted-foreground mb-4">{description}</p>
  <Tabs value={activeTab} class="w-full">
    <TabsList class="h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground grid grid-cols-6 mb-0">
      <TabsTrigger class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" value="overview">
        <a href={`/git/repo/${repoId}/overview`} class="flex items-center gap-2">
          <FileCode class="h-4 w-4" />
          Overview
        </a>
      </TabsTrigger>
      <TabsTrigger class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" value="code">
        <a href={`/git/repo/${repoId}/code`} class="flex items-center gap-2">
          <GitBranch class="h-4 w-4" />
          Code
        </a>
      </TabsTrigger>
      <TabsTrigger class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" value="issues">
        <a href={`/git/repo/${repoId}/issues`} class="flex items-center gap-2">
          <CircleAlert class="h-4 w-4" />
          Issues
        </a>
      </TabsTrigger>
      <TabsTrigger class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" value="patches">
        <a href={`/git/repo/${repoId}/patches`} class="flex items-center gap-2">
          <GitPullRequest class="h-4 w-4" />
          Patches
        </a>
      </TabsTrigger>
      <TabsTrigger class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" value="wiki">
        <a href={`/git/repo/${repoId}/wiki`} class="flex items-center gap-2">
          <Book class="h-4 w-4" />
          Wiki
        </a>
      </TabsTrigger>
      <TabsTrigger class="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm" value="live">
        <a href={`/git/repo/${repoId}/live`} class="flex items-center gap-2">
          <span class="relative flex h-2 w-2 mr-1">
            <span class="animate-pulse-git absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Live Session
        </a>
      </TabsTrigger>
    </TabsList>
  </Tabs>
</div>
