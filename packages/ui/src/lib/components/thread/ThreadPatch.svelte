<script lang="ts">
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage } = useRegistry();
  import TimeAgo from "../../TimeAgo.svelte";
  import PatchCard from "$lib/components/git/PatchCard.svelte";

  const {
    repoId,
    author,
    createdAt,
    metadata,
  }: {
    repoId: string;
    author: import('@nostr-git/shared-types').Profile;
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
</script>

<div class="flex gap-3 group py-2">
  <Avatar class="h-8 w-8 mt-0.5">
    <AvatarImage src={author?.avatar ?? author?.picture ?? ''} alt={author?.name ?? author?.display_name ?? ''} />
    <AvatarFallback>{(author?.name ?? author?.display_name ?? '').slice(0, 2).toUpperCase()}</AvatarFallback>
  </Avatar>
  <div class="flex-1">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-sm">{author.name}</span>
      <span class="text-xs" style="color: hsl(var(--muted-foreground));"
        ><TimeAgo date={createdAt} /></span
      >
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
