<script lang="ts">
  import { type NostrEvent } from "nostr-tools";
  import FeedItem from "./FeedItem.svelte";
  import RichText from "../RichText.svelte";
  import type { Profile } from "@nostr-git/shared-types";

  interface Props {
    event: NostrEvent;
    author?: Profile;
    onReply?: () => void;
    onReact?: () => void;
    onBookmark?: () => void;
    isReply?: boolean;
  }

  const { event, author, onReply, onReact, onBookmark, isReply = false }: Props = $props();

  const commentContent = $derived(event.content || "");
  const createdDate = $derived(new Date(event.created_at * 1000).toISOString());
  
  // Check if this is a reply to something
  let replyToTitle = $state("");
  
  $effect(() => {
    const tags = event.tags || [];
    for (const tag of tags) {
      if (tag[0] === "title") {
        replyToTitle = tag[1] || "";
        break;
      }
    }
  });
</script>

<FeedItem
  author={author || { name: "Unknown", picture: "", pubkey: "" }}
  createdAt={createdDate}
  eventId={event.id}
  onReply={onReply}
  onReact={onReact}
  onBookmark={onBookmark}
>
  <!-- Reply Context (if applicable) -->
  {#if isReply && replyToTitle}
    <div class="mb-2 pl-2.5 border-l-2 border-blue-500/30 text-[11px] text-gray-500 bg-blue-500/5 rounded-r py-1 pr-2">
      <span>Replying to</span>
      <span class="text-gray-400 font-semibold ml-1">{replyToTitle}</span>
    </div>
  {/if}

  <!-- Comment Content -->
  <div class="text-[14px] text-gray-300 leading-relaxed prose prose-invert prose-sm max-w-none">
    <RichText content={commentContent} prose={true} />
  </div>
</FeedItem>
