<script lang="ts">
  import { useRegistry } from "./useRegistry";
  const { Avatar, AvatarFallback, AvatarImage } = useRegistry();
  import { formatDistanceToNow } from "date-fns";
  import PatchCard from "$lib/PatchCard.svelte";

  const {
    repoId,
    author,
    createdAt,
    metadata,
  }: {
    repoId: string;
    author: { name: string; avatar: string };
    createdAt: string;
    metadata: {
      patchId: string;
      title: string;
      description: string;
      baseBranch: string;
      commitCount: number;
      commentCount: number;
      status: "open" | "merged" | "closed";
    };
  } = $props();

  const timeAgo = $derived(() => formatDistanceToNow(new Date(createdAt), { addSuffix: true }));
</script>

<div class="flex gap-3 group py-2">
  <Avatar class="h-8 w-8 mt-0.5">
    <AvatarImage src={author.avatar} alt={author.name} />
    <AvatarFallback>{author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
  </Avatar>
  <div class="flex-1">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-sm">{author.name}</span>
      <span class="text-xs text-muted-foreground">{timeAgo}</span>
    </div>
    <div class="mt-1">
      <PatchCard
        id={metadata.patchId}
        repoId={repoId}
        title={metadata.title}
        description={metadata.description}
        author={author}
        baseBranch={metadata.baseBranch}
        commitCount={metadata.commitCount}
        commentCount={metadata.commentCount}
        createdAt={createdAt}
        status={metadata.status}
      />
    </div>
  </div>
</div>
