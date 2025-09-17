<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoActivityFeed from "./RepoActivityFeed.svelte";
  const { Story } = defineMeta({
    title: "RepoActivityFeed",
    component: RepoActivityFeed,
    argTypes: {
      activities: { control: "object" },
    },
    args: {
      activities: [
        {
          id: "a1",
          type: "commit",
          title: "Initial commit",
          user: {
            name: "Alice",
            picture: "https://i.pravatar.cc/40?u=alice",
            display_name: "Alice Cooper",
            nip05: "alice@example.com",
          },
          timestamp: new Date().toISOString(),
        },
        {
          id: "a2",
          type: "star",
          title: "Starred by Bob",
          user: {
            name: "Bob",
            picture: "https://i.pravatar.cc/40?u=bob",
            display_name: "Bob Marley",
            nip05: "bob@example.com",
          },
          timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        },
      ],
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoActivityFeed {...args} />
  </svelte:fragment>
</Story>

<Story name="Full Profile Object">
  <RepoActivityFeed
    activities={[
      {
        id: "a3",
        type: "star",
        title: "Starred by Grace",
        user: {
          name: "Grace",
          picture: "https://i.pravatar.cc/40?u=grace",
          display_name: "Grace Hopper",
          nip05: "grace@nostr.com",
          lud16: "grace@getalby.com",
          about: "Pioneer of computing.",
          website: "https://gracehopper.com",
        },
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      },
    ]}
  />
</Story>

<Story name="No Activity">
  <RepoActivityFeed activities={[]} />
</Story>
