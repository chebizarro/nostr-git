<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoSocialSidebar from "./RepoSocialSidebar.svelte";
  const { Story } = defineMeta({
    title: "RepoSocialSidebar",
    component: RepoSocialSidebar,
    argTypes: {
      watchers: { control: "number" },
      contributors: { control: "object" },
    },
    args: {
      watchers: 42,
      contributors: [
        {
          name: "Alice",
          picture: "https://i.pravatar.cc/40?u=alice",
          display_name: "Alice Cooper",
          nip05: "alice@example.com",
        },
        {
          name: "Bob",
          picture: "https://i.pravatar.cc/40?u=bob",
          display_name: "Bob Marley",
          nip05: "bob@example.com",
        },
      ],
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoSocialSidebar {...args} />
  </svelte:fragment>
</Story>

<Story name="Full Profile Contributor">
  <RepoSocialSidebar
    watchers={77}
    contributors={[
      {
        name: "Grace",
        picture: "https://i.pravatar.cc/40?u=grace",
        display_name: "Grace Hopper",
        nip05: "grace@nostr.com",
        lud16: "grace@getalby.com",
        about: "Pioneer of computing.",
        website: "https://gracehopper.com",
      },
    ]}
  />
</Story>

<Story name="Many Contributors">
  <RepoSocialSidebar
    watchers={100}
    contributors={[
      {
        name: "Alice",
        picture: "https://i.pravatar.cc/40?u=alice",
        display_name: "Alice Cooper",
        nip05: "alice@example.com",
      },
      {
        name: "Bob",
        picture: "https://i.pravatar.cc/40?u=bob",
        display_name: "Bob Marley",
        nip05: "bob@example.com",
      },
      {
        name: "Carol",
        picture: "https://i.pravatar.cc/40?u=carol",
        display_name: "Carol King",
        nip05: "carol@example.com",
      },
      {
        name: "Dave",
        picture: "https://i.pravatar.cc/40?u=dave",
        display_name: "Dave Grohl",
        nip05: "dave@example.com",
      },
      {
        name: "Eve",
        picture: "https://i.pravatar.cc/40?u=eve",
        display_name: "Eve Adams",
        nip05: "eve@example.com",
      },
    ]}
  />
</Story>
