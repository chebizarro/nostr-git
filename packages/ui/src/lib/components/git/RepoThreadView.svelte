<script lang="ts">
  import { useRegistry } from "../../useRegistry";
  const { Separator } = useRegistry();
  import ThreadMessage from "../thread/ThreadMessage.svelte";
  import ThreadCommit from "../thread/ThreadCommit.svelte";
  import ThreadPatch from "../thread/ThreadPatch.svelte";
  import ThreadIssue from "../thread/ThreadIssue.svelte";
  import ThreadComposer from "../thread/ThreadComposer.svelte";
  import { Status } from "@nostr-git/shared-types";

  // Expect all props to be destructured at once (Svelte 5: only one $props() call allowed)
  const {
    repoId,
    events = [],
  }: {
    repoId: string;
    events?: ThreadEvent[];
  } = $props();

  // Discriminated union for strong type safety
  type ThreadCommitEvent = {
    id: string;
    type: "commit";
    content: string;
    author: { name: string; avatar: string; pubkey: string; picture: string; display_name: string; };
    createdAt: string;
    metadata: { hash: string };
  };

  type ThreadPatchEvent = {
    id: string;
    type: "patch";
    content: string;
    author: { name: string; avatar: string; pubkey: string; picture: string; display_name: string; };
    createdAt: string;
    metadata: {
      patchId: string;
      title: string;
      description: string;
      baseBranch: string;
      commitCount: number;
      commentCount: number;
      status: Status;
    };
  };

  type ThreadIssueEvent = {
    id: string;
    type: "issue";
    content: string;
    author: { name: string; avatar: string; pubkey: string; picture: string; display_name: string; };
    createdAt: string;
    metadata: {
      issueId: string;
      title: string;
      description: string;
      labels: string[];
      commentCount: number;
      status: Status;
    };
  };

  type ThreadMessageEvent = {
    id: string;
    type: "message";
    content: string;
    author: { name: string; avatar: string; pubkey: string; picture: string; display_name: string; };
    createdAt: string;
  };

  type ThreadEvent = ThreadCommitEvent | ThreadPatchEvent | ThreadIssueEvent | ThreadMessageEvent;

  const handleSubmit = (msg: string) => {
    console.log("New message:", msg);
  };
</script>

<!-- layout -->
<div class="flex flex-col h-full">
  <div class="flex-1 overflow-y-auto px-4 py-2 space-y-2">
    {#each events as e (e.id)}
      {#if e.type === "message"}
        <ThreadMessage content={e.content} author={e.author} createdAt={e.createdAt} />
      {:else if e.type === "commit" && e.metadata}
        <ThreadCommit
          content={e.content}
          author={e.author}
          createdAt={e.createdAt}
          metadata={e.metadata}
        />
      {:else if e.type === "patch" && e.metadata}
        <ThreadPatch
          repoId={repoId}
          author={e.author}
          createdAt={e.createdAt}
          metadata={e.metadata}
        />
      {:else if e.type === "issue" && e.metadata}
        <ThreadIssue
          repoId={repoId}
          author={e.author}
          createdAt={e.createdAt}
          metadata={e.metadata}
        />
      {/if}
      <Separator class="my-2" />
    {/each}
  </div>

  <div class="mt-auto border-t p-4 bg-background">
    <ThreadComposer onSubmit={handleSubmit} />
  </div>
</div>
