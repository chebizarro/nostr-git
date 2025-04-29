<script lang="ts">
  import { PlayCircle, Users } from "@lucide/svelte";
  import { formatDistanceToNow } from "date-fns";
  import { Link } from "svelte-routing";
  import { useRegistry } from './useRegistry';
  const { Avatar, AvatarFallback, AvatarImage, Button } = useRegistry();

  const {
    id,
    repoId,
    title,
    host,
    language,
    participantCount,
    startedAt,
    isActive,
  }: {
    id: string;
    repoId: string;
    title: string;
    host: { name: string; avatar: string };
    language: string;
    participantCount: number;
    startedAt: string;
    isActive: boolean;
  } = $props();

  const timeAgo = $derived(() => formatDistanceToNow(new Date(startedAt), { addSuffix: true }));
</script>

<div
  class="git-card border border-border rounded-lg bg-card p-4 hover:border-primary/50 transition-all"
>
  <div class="flex items-start gap-3">
    <div class="relative">
      <PlayCircle class="h-6 w-6 {isActive ? 'text-green-500' : 'text-muted-foreground'}" />
      {#if isActive}
        <span
          class="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse border border-background"
        ></span>
      {/if}
    </div>

    <!-- details -->
    <div class="flex-1">
      <Link to={`/git/repo/${repoId}/live/${id}`}>
        <h3 class="text-lg font-medium hover:text-primary transition-colors">
          {title}
        </h3>
      </Link>

      <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
        <span class="git-tag bg-git px-2 py-0.5 rounded-full">{language}</span>
        <span>•</span>
        <span>Started {timeAgo} by {host.name}</span>
        <span>•</span>
        <div class="flex items-center gap-1">
          <Users class="h-3 w-3" />
          <span>{participantCount} participant{participantCount !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-between">
        <Link to={`/git/repo/${repoId}/live/${id}`}>
          <Button
            size="sm"
            variant={isActive ? "default" : "outline"}
            class={isActive ? "bg-git hover:bg-git-hover" : ""}
          >
            {isActive ? "Join session" : "View recording"}
          </Button>
        </Link>

        <Avatar class="h-8 w-8">
          <AvatarImage src={host.avatar} alt={host.name} />
          <AvatarFallback>{host.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  </div>
</div>
