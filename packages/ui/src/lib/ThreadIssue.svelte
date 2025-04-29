<script lang="ts">
  import { Avatar, AvatarFallback, AvatarImage } from "$lib/components/ui/avatar";
  import { formatDistanceToNow } from "date-fns";
  import IssueCard from "$lib/IssueCard.svelte";

  const props = $props();
  const repoId: string = props.repoId;
  const author: { name: string; avatar: string } = props.author;
  const createdAt: string = props.createdAt;
  const metadata: {
    issueId: string;
    title: string;
    description: string;
    labels: string[];
    commentCount: number;
    status: "open" | "closed" | "resolved";
  } = props.metadata;

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
      <IssueCard
        id={metadata.issueId}
        repoId={repoId}
        title={metadata.title}
        description={metadata.description}
        author={author}
        labels={metadata.labels}
        commentCount={metadata.commentCount}
        createdAt={createdAt}
        status={metadata.status}
      />
    </div>
  </div>
</div>
