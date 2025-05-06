<script lang="ts">
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage } = useRegistry();
  import TimeAgo from "../../TimeAgo.svelte";
  import IssueCard from "$lib/components/git/IssueCard.svelte";

  const props = $props();
  const repoId: string = props.repoId;
  import type { Profile } from '@nostr-git/shared-types';
  const author: Profile = props.author;
  const createdAt: string = props.createdAt;
  const metadata: {
    issueId: string;
    title: string;
    description: string;
    labels: string[];
    commentCount: number;
    status: "open" | "closed" | "resolved";
  } = props.metadata;
</script>

<div class="flex gap-3 group py-2">
  <Avatar class="h-8 w-8 mt-0.5">
    <AvatarImage src={author?.avatar ?? author?.picture ?? ''} alt={author?.name ?? author?.display_name ?? ''} />
    <AvatarFallback>{(author?.name ?? author?.display_name ?? '').slice(0, 2).toUpperCase()}</AvatarFallback>
  </Avatar>
  <div class="flex-1">
    <div class="flex items-center gap-2">
      <span class="font-semibold text-sm">{author.name}</span>
      <span class="text-xs text-muted-foreground"><TimeAgo date={createdAt} /></span>
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
