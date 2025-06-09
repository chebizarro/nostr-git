<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import { MessageSquare } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarFallback, AvatarImage, Button, Textarea, Card } = useRegistry();
  import { createCommentEvent, parseCommentEvent } from "@nostr-git/shared-types";
  import type { CommentEvent, Profile } from "@nostr-git/shared-types";
  import { getContext } from "svelte";

  const postComment: (comment: CommentEvent) => void = getContext("postComment");

  const getProfile: (pubkey: string) => Profile = getContext("getProfile");

  function submitComment(commentData: CommentEvent) {
    postComment(commentData);
  }

  const {
    issueId,
    comments = [],
  }: {
    issueId: string;
    comments?: CommentEvent[];
  } = $props();

  let newComment = $state("");

  const commentsParsed = $derived.by(() => {
    return comments
      .filter((c) => c.tags.some((t) => t[0] === "E" && t[1] === issueId))
      .map((c) => parseCommentEvent(c));
  });

  function submit(event: Event) {
    event.preventDefault();
    if (!newComment.trim()) return;

    const commentEvent = createCommentEvent({
      content: newComment,
      root: {
        type: "E",
        value: issueId,
        kind: "1621",
      },
    });

    newComment = "";

    submitComment(commentEvent);
  }
</script>

<Card class="mt-2 border-none shadow-none">
  <div class="space-y-4 p-4">
    {#each commentsParsed as c (c.id)}
    {@const author = getProfile(c.author.pubkey)}
    <div class="flex gap-3 group animate-fade-in">
        {#if author}
          <Avatar class="h-8 w-8">
            <AvatarImage src={author.picture} alt={author.name} />
          </Avatar>
        {/if}
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <button class="font-semibold text-sm" onclick={() => console.log(c.author)}
              >{c.author.pubkey}</button
            >
            <button class="text-xs text-muted-foreground">
              <TimeAgo date={c.createdAt} />
            </button>
          </div>
          <p class="text-sm mt-1 whitespace-pre-wrap">{c.content}</p>
        </div>
      </div>
    {/each}

    <form onsubmit={submit} class="flex gap-3 pt-4 border-t">
      <Avatar class="h-8 w-8">
        <AvatarFallback>ME</AvatarFallback>
      </Avatar>
      <div class="flex-1 space-y-2">
        <Textarea
          bind:value={newComment}
          placeholder="Write a comment..."
          class="min-h-[80px] resize-none"
        />
        <div class="flex justify-end">
          <Button type="submit" class="gap-2" disabled={!newComment.trim()}>
            <MessageSquare class="h-4 w-4" /> Comment
          </Button>
        </div>
      </div>
    </form>
  </div>
</Card>
