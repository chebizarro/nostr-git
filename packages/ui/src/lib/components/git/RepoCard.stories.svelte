<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoCard from "./RepoCard.svelte";
  const { Story } = defineMeta({
    title: "RepoCard",
    component: RepoCard,
    argTypes: {
      event: { control: "object" },
      owner: { control: "object" },
      issueCount: { control: "number" },
      lastUpdated: { control: "date" },
    },
    args: {
      event: {
        id: "repo-demo",
        pubkey: "npub1alicepubkey",
        created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 2,
        kind: 30617,
        content: "A demo repo for controls.",
        tags: [
          ["d", "repo-demo"],
          ["name", "Demo Repo"],
          ["description", "A demo repo for controls."],
        ],
        sig: "testsig-demo",
      },
      owner: {
        name: "Alice",
        picture: "https://i.pravatar.cc/40?u=alice",
        display_name: "Alice Cooper",
        nip05: "alice@example.com",
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
    event={{
      id: "r1",
      pubkey: "npub1alicepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7,
      kind: 30617,
      content: "A decentralized git collaboration platform built on nostr.",
      tags: [
        ["d", "nostr-git"],
        ["name", "nostr-git"],
        ["description", "A decentralized git collaboration platform built on nostr."],
      ],
      sig: "testsig-popular",
    }}
    owner={{
      name: "Alice",
      picture: "https://i.pravatar.cc/40?u=alice",
      display_name: "Alice Cooper",
      nip05: "alice@example.com",
    }}
    issueCount={42}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()}
  />
</Story>

<Story name="Recently Updated">
  <RepoCard
    event={{
      id: "r2",
      pubkey: "npub1bobpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 10,
      kind: 30617,
      content: "A starter template for SvelteKit projects.",
      tags: [
        ["d", "sveltekit-starter"],
        ["name", "sveltekit-starter"],
        ["description", "A starter template for SvelteKit projects."],
      ],
      sig: "testsig-recent",
    }}
    owner={{
      name: "Bob Marley",
      picture: "https://i.pravatar.cc/40?u=bob",
      display_name: "Bob Marley",
      nip05: "bob@example.com",
    }}
    issueCount={3}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 10).toISOString()}
  />
</Story>

<Story name="Stale Repo">
  <RepoCard
    event={{
      id: "r3",
      pubkey: "npub1carolpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365,
      kind: 30617,
      content: "This repo hasn't been updated in a long time.",
      tags: [
        ["d", "abandoned-repo"],
        ["name", "abandoned-repo"],
        ["description", "This repo hasn't been updated in a long time."],
      ],
      sig: "testsig-stale",
    }}
    owner={{
      name: "Carol",
      picture: "https://i.pravatar.cc/40?u=carol",
      display_name: "Carol King",
      nip05: "carol@example.com",
    }}
    issueCount={0}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString()}
  />
</Story>

<Story name="Different Owner Avatars">
  <RepoCard
    event={{
      id: "r4",
      pubkey: "npub1davepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 6,
      kind: 30617,
      content: "A repo with an owner who has a custom avatar.",
      tags: [
        ["d", "multi-owner-repo"],
        ["name", "multi-owner-repo"],
        ["description", "A repo with an owner who has a custom avatar."],
      ],
      sig: "testsig-multi",
    }}
    owner={{
      name: "Dave",
      picture: "https://i.pravatar.cc/40?u=dave",
      display_name: "Dave Grohl",
      nip05: "dave@example.com",
    }}
    issueCount={7}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()}
  />
</Story>

<Story name="Full Profile Object">
  <RepoCard
    event={{
      id: "r6",
      pubkey: "npub1gracepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 3,
      kind: 30617,
      content: "Repo with owner as a full Profile object.",
      tags: [
        ["d", "full-profile-repo"],
        ["name", "full-profile-repo"],
        ["description", "Repo with owner as a full Profile object."],
      ],
      sig: "testsig-full",
    }}
    owner={{
      name: "Grace",
      picture: "https://i.pravatar.cc/40?u=grace",
      display_name: "Grace Hopper",
      nip05: "grace@nostr.com",
      lud16: "grace@getalby.com",
      about: "Pioneer of computing.",
      website: "https://gracehopper.com",
    }}
    issueCount={5}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()}
  />
</Story>

<Story name="Edge: Missing Avatar">
  <RepoCard
    event={{
      id: "r5",
      pubkey: "npub1noavatarpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24,
      kind: 30617,
      content: "Repo with owner missing avatar.",
      tags: [
        ["d", "no-avatar-repo"],
        ["name", "no-avatar-repo"],
        ["description", "Repo with owner missing avatar."],
      ],
      sig: "testsig-noavatar",
    }}
    owner={{ name: "Eve" }}
    issueCount={2}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
  />
</Story>

<Story name="Edge: Missing Display Name">
  <RepoCard
    event={{
      id: "r7",
      pubkey: "npub1nodisplaypubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 5,
      kind: 30617,
      content: "Repo with owner missing display name.",
      tags: [
        ["d", "no-display-repo"],
        ["name", "no-display-repo"],
        ["description", "Repo with owner missing display name."],
      ],
      sig: "testsig-nodisplay",
    }}
    owner={{ picture: "https://i.pravatar.cc/40?u=frank" }}
    issueCount={1}
    lastUpdated={new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()}
  />
</Story>
