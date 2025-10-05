<script lang="ts">
  import { cn } from "../../utils";
  import { GitBranch, Eye, GitFork, RotateCcw, Settings, LayoutDashboard } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Button } = useRegistry();
  import { Repo } from "./Repo.svelte";
  import { BranchSelector } from "..";

  const {
    repoClass,
    activeTab = "overview",
    children,
    refreshRepo,
    isRefreshing = false,
    forkRepo,
    settingsRepo,
    overviewRepo,
  }: {
    repoClass: Repo;
    activeTab?: string;
    children?: any;
    refreshRepo?: () => Promise<void>;
    forkRepo?: () => void;
    overviewRepo?: () => void;
    isRefreshing?: boolean;
    settingsRepo?: () => void;
  } = $props();
  const name = repoClass.name;
  const description = repoClass.description;
</script>

<div class="border-b border-border pb-4">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-bold flex items-center gap-2">
      <GitBranch class="h-6 w-6" />
      {name}
    </h1>
    <div class="flex items-center gap-1 sm:gap-2">
      <Button
        variant="outline"
        size="sm"
        class="gap-1 sm:gap-2 px-2 sm:px-3"
        onclick={overviewRepo}
        title="Repo Overview"
      >
        <LayoutDashboard class="h-4 w-4" />
      </Button>
      <!--
      <Button
        variant="outline"
        size="sm"
        class="gap-1 sm:gap-2 px-2 sm:px-3"
        onclick={watchRepo}
        title={isRepoWatched ? "Unwatch" : "Watch"}
      >
        <Eye class="h-4 w-4" />
      </Button>
       -->
      <Button
        variant="outline"
        size="sm"
        class="gap-1 sm:gap-2 px-2 sm:px-3"
        onclick={forkRepo}
        title="Fork"
      >
        <GitFork class="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="gap-1 sm:gap-2 px-2 sm:px-3"
        onclick={refreshRepo}
        disabled={isRefreshing}
        title={isRefreshing ? "Syncing..." : "Refresh"}
      >
        <RotateCcw class="h-4 w-4 {isRefreshing ? 'animate-spin' : ''}" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        class="gap-1 sm:gap-2 px-2 sm:px-3"
        onclick={settingsRepo}
        title="Settings"
      >
        <Settings class="h-4 w-4" />
      </Button>
      <BranchSelector repo={repoClass} />
    </div>
  </div>
  <p class="text-muted-foreground mb-4">{description}</p>

  <!-- Authentication Status Indicator
  <div class="mb-4">
    <AuthStatusIndicator repository={repoClass} pubkey={pubkey} />
  </div>
 -->
  <nav class={cn("bg-muted text-muted-foreground rounded-md w-full")}>
    <div class="flex overflow-x-auto scrollbar-hide">
      <div class="w-full flex justify-evenly gap-1 m-1 min-w-max">
        {@render children?.(activeTab)}
      </div>
    </div>
  </nav>
</div>

<style>
  /* Hide scrollbar for Chrome, Safari and Opera */
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* Hide scrollbar for IE, Edge and Firefox */
  .scrollbar-hide {
    -ms-overflow-style: none; /* IE and Edge */
    scrollbar-width: none; /* Firefox */
  }
</style>
