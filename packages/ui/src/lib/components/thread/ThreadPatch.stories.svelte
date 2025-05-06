<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ThreadPatch from "./ThreadPatch.svelte";
  const { Story } = defineMeta({
    title: "ThreadPatch",
    component: ThreadPatch,
    argTypes: {
      repoId: { control: "text" },
      author: {
        control: "object",
        defaultValue: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
      },
      createdAt: { control: "date" },
      metadata: {
        control: "object",
        defaultValue: {
          patchId: "p1",
          title: "Patch",
          description: "Patch desc",
          baseBranch: "main",
          commitCount: 1,
          commentCount: 0,
          status: "open",
        },
      },
    },
    args: {
      repoId: "repo-1",
      author: { name: "Alice", picture: "https://i.pravatar.cc/40?u=alice", display_name: "Alice Cooper", nip05: "alice@example.com" },
      createdAt: new Date().toISOString(),
      metadata: {
        patchId: "p1",
        title: "Patch",
        description: "Patch desc",
        baseBranch: "main",
        commitCount: 1,
        commentCount: 0,
        status: "open",
      },
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadPatch {...args} />
  </svelte:fragment>
</Story>

<Story name="Full Profile Author">
  <ThreadPatch
    repoId="repo-3"
    author={{ name: "Grace", picture: "https://i.pravatar.cc/40?u=grace", display_name: "Grace Hopper", nip05: "grace@nostr.com", lud16: "grace@getalby.com", about: "Pioneer of computing.", website: "https://gracehopper.com" }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString()}
    metadata={{
      patchId: "3",
      title: "Profile Patch",
      description: "This patch uses a full Profile object for the author.",
      labels: ["profile", "test"],
      commentCount: 2,
      status: "open",
    }}
  />
</Story>

<Story name="Merged Patch">
  <ThreadPatch
    repoId="repo-2"
    author={{ name: "Bob", picture: "https://i.pravatar.cc/40?u=bob", display_name: "Bob Marley", nip05: "bob@example.com" }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    metadata={{
      patchId: "p2",
      title: "Merged",
      description: "Merged patch",
      baseBranch: "dev",
      commitCount: 3,
      commentCount: 2,
      status: "merged",
    }}
  />
</Story>
