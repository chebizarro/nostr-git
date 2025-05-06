<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import PatchCard from "./PatchCard.svelte";
  const { Story } = defineMeta({
    title: "PatchCard",
    component: PatchCard,
    argTypes: {
      event: { control: "object" },
      owner: { control: "object" },
    },
    args: {
      event: {
        id: "patch1",
        pubkey: "npub1davepubkey",
        created_at: Math.floor(Date.now() / 1000),
        kind: 1617,
        content: "Implements dark mode for all UI components.",
        tags: [
          ["a", "repo1"],
          ["subject", "Add dark mode"],
          ["base-branch", "main"],
          ["commit", "abc123"],
          ["commit", "def456"],
          ["commit", "ghi789"],
          ["e", "comment1"],
          ["t", "open"]
        ],
        sig: "testsig",
      },
      owner: {
        name: "Dave",
        display_name: "Dave Grohl",
        picture: "https://i.pravatar.cc/40?u=dave",
        nip05: "dave@example.com"
      }
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <PatchCard event={args.event} owner={args.owner} />
  </svelte:fragment>
</Story>

<Story name="Merged Patch">

  <PatchCard event={{
    id: "patch2",
    pubkey: "npub1evepubkey",
    created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3,
    kind: 1617,
    content: "Major refactor of backend logic.",
    tags: [
      ["a", "repo2"],
      ["subject", "Refactor backend"],
      ["base-branch", "dev"],
      ["commit", "xyz111"],
      ["commit", "xyz222"],
      ["commit", "xyz333"],
      ["commit", "xyz444"],
      ["commit", "xyz555"],
      ["commit", "xyz666"],
      ["commit", "xyz777"],
      ["commit", "xyz888"],
      ["commit", "xyz999"],
      ["commit", "xyz000"],
      ["e", "comment1"],
      ["e", "comment2"],
      ["e", "comment3"],
      ["e", "comment4"],
      ["e", "comment5"],
      ["t", "merged"]
    ],
    sig: "testsig2",
  }}
  owner={{
    name: "Eve",
    display_name: "Eve Adams",
    picture: "https://i.pravatar.cc/40?u=eve",
    nip05: "eve@example.com"
  }} />
</Story>
