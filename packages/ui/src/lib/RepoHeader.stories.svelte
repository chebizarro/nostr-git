<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoHeader from "./RepoHeader.svelte";
  const { Story } = defineMeta({
    title: "RepoHeader",
    component: RepoHeader,
    argTypes: {
      name: { control: "text" },
      owner: {
        control: "object",
        defaultValue: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
      },
      description: { control: "text" },
      stars: { control: "number" },
      forks: { control: "number" },
      lastUpdated: { control: "date" },
    },
    args: {
      name: "nostr-git",
      owner: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
      description: "A decentralized git collaboration platform.",
      stars: 100,
      forks: 20,
      lastUpdated: new Date().toISOString(),
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoHeader {...args} />
  </svelte:fragment>
</Story>

<Story name="Minimal Repo">
  <RepoHeader
    name="tiny-repo"
    owner={{ name: "Bob", avatar: "https://i.pravatar.cc/40?u=bob" }}
    description="A minimal repo."
    stars={1}
    forks={0}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()}
  />
</Story>
