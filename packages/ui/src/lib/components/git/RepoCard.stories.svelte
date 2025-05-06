<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoCard from "./RepoCard.svelte";
  const { Story } = defineMeta({
    title: "RepoCard",
    component: RepoCard,
    argTypes: {
      id: { control: "text", description: "Repo ID" },
      name: { control: "text" },
      description: { control: "text" },
      owner: {
        control: "object",
        defaultValue: {
          name: "Alice",
          avatar: "https://i.pravatar.cc/40?u=alice",
          email: "alice@example.com",
        },
      },
      issueCount: { control: "number" },
      lastUpdated: { control: "date" },
    },
    args: {
      id: "repo-demo",
      name: "Demo Repo",
      description: "A demo repo for controls.",
      owner: {
        name: "Alice",
        avatar: "https://i.pravatar.cc/40?u=alice",
        email: "alice@example.com",
      },
      issueCount: 0,
      lastUpdated: new Date().toISOString(),
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoCard {...args} />
  </svelte:fragment>
</Story>

<Story name="Popular Repo">
  <RepoCard
    id="r1"
    name="nostr-git"
    description="A decentralized git collaboration platform built on nostr."
    owner={{ name: "Alice", picture: "https://i.pravatar.cc/40?u=alice", display_name: "Alice Cooper", nip05: "alice@example.com" }}
    issueCount={42}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()}
  />
</Story>

<Story name="Recently Updated">
  <RepoCard
    id="r2"
    name="sveltekit-starter"
    description="A starter template for SvelteKit projects."
    owner={{ name: "Bob", picture: "https://i.pravatar.cc/40?u=bob", display_name: "Bob Marley", nip05: "bob@example.com" }}
    issueCount={3}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 10).toISOString()}
  />
</Story>

<Story name="Stale Repo">
  <RepoCard
    id="r3"
    name="abandoned-repo"
    description="This repo hasn't been updated in a long time."
    owner={{ name: "Carol", picture: "https://i.pravatar.cc/40?u=carol", display_name: "Carol King", nip05: "carol@example.com" }}
    issueCount={0}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString()}
  />
</Story>

<Story name="Different Owner Avatars">
  <RepoCard
    id="r4"
    name="multi-owner-repo"
    description="A repo with an owner who has a custom avatar."
    owner={{ name: "Dave", picture: "https://i.pravatar.cc/40?u=dave", display_name: "Dave Grohl", nip05: "dave@example.com" }}
    issueCount={7}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()}
  />
</Story>

<Story name="Full Profile Object">
  <RepoCard
    id="r6"
    name="full-profile-repo"
    description="Repo with owner as a full Profile object."
    owner={{ name: "Grace", picture: "https://i.pravatar.cc/40?u=grace", display_name: "Grace Hopper", nip05: "grace@nostr.com", lud16: "grace@getalby.com", about: "Pioneer of computing.", website: "https://gracehopper.com" }}
    issueCount={5}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()}
  />
</Story>

<Story name="Edge: Missing Avatar">
  <RepoCard
    id="r5"
    name="no-avatar-repo"
    description="Repo owner has no avatar set."
    owner={{ name: "Eve", picture: "", display_name: "Eve Adams", nip05: "eve@example.com" }}
    issueCount={2}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString()}
  />
</Story>
