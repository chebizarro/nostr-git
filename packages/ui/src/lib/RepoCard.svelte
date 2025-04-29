<script lang="ts">
  import { formatDistanceToNow } from "date-fns";
  import { GitBranch, Star, BookOpen, Circle } from "@lucide/svelte";
  import { Avatar, Button, AvatarImage, AvatarFallback } from "$lib/components";

  const {
    id,
    name,
    description,
    owner,
    issueCount,
    lastUpdated,
  }: {
    id: string;
    name: string;
    description: string;
    owner: { name: string; avatar: string; email: string };
    issueCount: number;
    lastUpdated: string;
  } = $props();

  const timeAgo = $derived(() => formatDistanceToNow(new Date(lastUpdated), { addSuffix: true }));
</script>

<div class="git-card">
  <div class="flex items-start gap-4">
    <Avatar class="h-10 w-10">
      <AvatarImage src={owner.avatar} alt={owner.name} />
      <AvatarFallback>{owner.name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>

    <div class="flex-1 space-y-2">
      <div class="flex items-center gap-2">
        <Circle class="h-4 w-4 text-amber-500" />
        <span class="text-muted-foreground">{owner.name}</span>
        <span class="text-muted-foreground text-xs">{timeAgo}</span>
      </div>

      <a href={`/git/repo/${id}`} class="inline-block">
        <h3 class="text-lg font-medium hover:text-accent transition-colors">{name}</h3>
      </a>

      <p class="text-muted-foreground">{description}</p>

      <div class="flex flex-wrap gap-2 pt-2">
        <Button href={`/git/repo/${id}/browse`} variant="outline" size="sm" class="gap-2">
          <BookOpen class="h-4 w-4" /> Browse
        </Button>

        <Button href={`/git/repo/${id}/issues`} variant="outline" size="sm" class="gap-2 text-git-issue">
          Issues ({issueCount})
        </Button>
      </div>
    </div>

    <div class="flex space-x-2">
      <Button variant="ghost" size="icon" onclick={() => console.log("Star button clicked")}
        ><Star class="h-5 w-5" /></Button
      >
      <Button variant="ghost" size="icon" onclick={() => console.log("GitBranch button clicked")}
        ><GitBranch class="h-5 w-5" /></Button
      >
    </div>
  </div>

  <div class="mt-4 pt-4 border-t border-border">
    <div class="flex justify-between">
      <div class="text-sm text-muted-foreground">
        <p>{name}</p>
        <p>{description}</p>
      </div>
      <div class="flex flex-col items-end gap-2">
        <button
          class="text-xs text-purple-400 hover:underline"
          onclick={() => console.log("View on Web button clicked")}>View on Web</button
        >
        <div class="flex justify-between w-full gap-6">
          <div class="flex flex-col">
            <span class="text-sm font-medium">Recent Issues</span>
            <button
              class="text-xs text-purple-400 hover:underline"
              onclick={() => console.log("View Wiki button clicked")}>View Wiki</button
            >
          </div>
          <div class="flex flex-col items-end">
            <span class="text-sm font-medium">Recent Patches</span>
            <button
              class="text-xs text-green-400 hover:underline"
              onclick={() => console.log("Join Live Coding Session button clicked")}
              >Join Live Coding Session</button
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
