<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ThreadCommit from "./ThreadCommit.svelte";
  const { Story } = defineMeta({
    title: "ThreadCommit",
    component: ThreadCommit,
    argTypes: {
      content: { control: "text" },
      author: {
        control: "object",
        defaultValue: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
      },
      createdAt: { control: "date" },
      metadata: { control: "object", defaultValue: { hash: "abc123" } },
    },
    args: {
      content: "Initial commit",
      author: { name: "Alice", picture: "https://i.pravatar.cc/40?u=alice", display_name: "Alice Cooper", nip05: "alice@example.com" },
      createdAt: new Date().toISOString(),
      metadata: { hash: "abc123" },
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadCommit {...args} />
  </svelte:fragment>
</Story>

<Story name="Full Profile Author">
  <ThreadCommit
    content="Commit by Grace Hopper"
    author={{ name: "Grace", picture: "https://i.pravatar.cc/40?u=grace", display_name: "Grace Hopper", nip05: "grace@nostr.com", lud16: "grace@getalby.com", about: "Pioneer of computing.", website: "https://gracehopper.com" }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()}
    metadata={{ hash: "grace123" }}
  />
</Story>

<Story name="With Custom Hash">
  <ThreadCommit
    content="Refactor codebase"
    author={{ name: "Bob", picture: "https://i.pravatar.cc/40?u=bob", display_name: "Bob Marley", nip05: "bob@example.com" }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    metadata={{ hash: "def456" }}
  />
</Story>
