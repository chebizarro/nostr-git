<script lang="ts">
  import TimeAgo from '../../TimeAgo.svelte';
  import { MessageSquare } from "@lucide/svelte";
  import { useRegistry } from "../../useRegistry";
  const { Avatar, AvatarImage, Button, Textarea, Card } = useRegistry();
  import { createCommentEvent, parseCommentEvent } from "@nostr-git/shared-types";
  import type { CommentEvent, Profile } from "@nostr-git/shared-types";
  import { nip19 } from 'nostr-tools';

  interface Props {
    issueId: string;
    issueKind: '1621' | '1617';
    currentCommenter: string;
    currentCommenterProfile?: Profile,
    comments?: CommentEvent[];
    commenterProfiles?: Profile[];
    onCommentCreated: (comment: CommentEvent) => Promise<void>;
  }

  const {
    issueId,
    issueKind = '1621',
    comments,
    commenterProfiles,
    currentCommenter,
    currentCommenterProfile,
    onCommentCreated
  }: Props = $props();

  let newComment = $state("");

  const commentsParsed = $derived.by(() => {
    const profiles = commenterProfiles || [];

    return comments
      ?.filter((c) => c.tags.some((t) => t[0] === "E" && t[1] === issueId))
      .map((c) => {
        const parsed = parseCommentEvent(c);
        const profile = profiles.find((p) => p.pubkey === c.pubkey);
        return { ...parsed, authorProfile: profile };
      }) || [];
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

<Card class="mt-2 border-none shadow-none">
  <div class="space-y-4 p-2 sm:p-4 sm:px-8">
    {#each commentsParsed as c (c.id)}
      {@const authorName = c.authorProfile?.name ??
        nip19.npubEncode(c.author.pubkey).substring(0,9)
      }
      {@const authorProfile = c.authorProfile?.picture ?? ''}

      <div class="w-full flex gap-3 group animate-fade-in">
        <Avatar class="h-8 w-8">
          <AvatarImage 
            class="h-full w-full"
            src={authorProfile}
            alt={authorName} 
          />
        </Avatar>
        <div class="w-full flex flex-col gap-y-2">
          <div class="w-full grid grid-cols-[1fr_auto] space-x-2">
            <div>{authorName}</div>
            <div class="text-sm text-muted-foreground">
              <TimeAgo date={c.createdAt} />
            </div>
          </div>
          <p class="text-md whitespace-pre-wrap">{c.content}</p>
        </div>
      </div>
    {/each}

    <form onsubmit={submit} class="flex gap-3 pt-4 border-t">
      <Avatar class="h-8 w-8">
        <AvatarImage 
          src={currentCommenterProfile.picture ?? ''} 
          alt={currentCommenterProfile.name || nip19.npubEncode(currentCommenter).substring(0, 9)} 
        />
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
