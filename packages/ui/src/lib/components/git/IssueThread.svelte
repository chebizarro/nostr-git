<script lang="ts">
  import TimeAgo from "../../TimeAgo.svelte";
  import { MessageSquare } from "@lucide/svelte";
  import { createCommentEvent, parseCommentEvent } from "@nostr-git/shared-types";
  import type { CommentEvent, Profile } from "@nostr-git/shared-types";

  import { useRegistry } from "../../useRegistry";
  import { slide } from "svelte/transition";
  const { Button, Textarea, Card, ProfileComponent } = useRegistry();

  interface Props {
    issueId: string;
    issueKind: "1621" | "1617";
    currentCommenter: string;
    currentCommenterProfile?: Profile;
    comments?: CommentEvent[] | undefined;
    commenterProfiles?: Profile[] | undefined;
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
  }

  const {
    issueId,
    issueKind = "1621",
    comments,
    currentCommenter,
    onCommentCreated,
  }: Props = $props();

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
        kind: issueKind,
      },
    });

    newComment = "";

    onCommentCreated(commentEvent);
  }
</script>

<div transition:slide>
  <Card class="p-2 border-none shadow-none">
    <div class="space-y-4">
      {#each commentsParsed as c (c.id)}
        <div class="w-full flex-col gap-3 group animate-fade-in">
          <div class="w-full grid grid-cols-[1fr_auto] space-x-2">
            <ProfileComponent pubkey={c.author.pubkey} hideDetails={false}></ProfileComponent>
            <div class="text-sm text-muted-foreground">
              <TimeAgo date={c.createdAt} />
            </div>
          </div>
          <div class="w-full flex flex-col gap-y-2 mt-2">
            <p class="text-muted-foreground whitespace-pre-wrap">{c.content}</p>
          </div>
        </div>
      {/each}

      <form onsubmit={submit} class="flex flex-col gap-3 pt-4 border-t">
        <div class="flex gap-3">
          <div class="flex-shrink-0">
            <ProfileComponent pubkey={currentCommenter} hideDetails={true} />
          </div>
          <div class="flex-1">
            <Textarea
              bind:value={newComment}
              placeholder="Write a comment..."
              class="min-h-[80px] resize-none w-full"
            />
          </div>
        </div>
        <div class="flex justify-end">
          <Button type="submit" class="gap-2" disabled={!newComment.trim()}>
            <MessageSquare class="h-4 w-4" /> Comment
          </Button>
        </div>
      </form>
    </div>
  </Card>
</div>
