<script lang="ts">
  import { Button, Tabs, TabsList, TabsTrigger } from "$lib/components";
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
  import type { RepoAnnouncementEvent, Profile } from '@nostr-git/shared-types';
  import { parseRepoAnnouncementEvent } from '@nostr-git/shared-types';

  // Accept props: event (NIP-34 RepoAnnouncementEvent), owner (Profile), activeTab
  const { event, owner = {}, activeTab = "overview" }: { event: RepoAnnouncementEvent, owner?: Profile, activeTab?: string } = $props();
  const parsed = parseRepoAnnouncementEvent(event);
  const name = parsed.name ?? "";
  const description = parsed.description ?? "";
  const repoId = parsed.repoId ?? "";
</script>

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
    <TabsList class="grid grid-cols-6 mb-0">
      <TabsTrigger value="overview">
        <a href={`/git/repo/${repoId}/overview`} class="flex items-center gap-2">
          <FileCode class="h-4 w-4" />
          Overview
        </a>
      </TabsTrigger>
      <TabsTrigger value="code">
        <a href={`/git/repo/${repoId}/code`} class="flex items-center gap-2">
          <GitBranch class="h-4 w-4" />
          Code
        </a>
      </TabsTrigger>
      <TabsTrigger value="issues">
        <a href={`/git/repo/${repoId}/issues`} class="flex items-center gap-2">
          <CircleAlert class="h-4 w-4" />
          Issues
        </a>
      </TabsTrigger>
      <TabsTrigger value="patches">
        <a href={`/git/repo/${repoId}/patches`} class="flex items-center gap-2">
          <GitPullRequest class="h-4 w-4" />
          Patches
        </a>
      </TabsTrigger>
      <TabsTrigger value="wiki">
        <a href={`/git/repo/${repoId}/wiki`} class="flex items-center gap-2">
          <Book class="h-4 w-4" />
          Wiki
        </a>
      </TabsTrigger>
      <TabsTrigger value="live">
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
