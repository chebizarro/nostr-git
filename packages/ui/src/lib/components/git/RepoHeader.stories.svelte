<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoHeader from "./RepoHeader.svelte";
  const { Story } = defineMeta({
  title: "RepoHeader",
  component: RepoHeader,
  argTypes: {
    event: { control: "object" },
    owner: { control: "object" },
    activeTab: { control: "text", defaultValue: "overview" },
  },
  args: {
    event: {
      id: "repo1",
      pubkey: "npub1bobpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30,
      kind: 30617,
      content: "A minimal repo.",
      tags: [
        ["d", "tiny-repo"],
        ["name", "tiny-repo"],
        ["description", "A minimal repo."],
      ],
      sig: "testsig1",
    },
    owner: { name: "Bob", picture: "https://i.pravatar.cc/40?u=bob" },
    activeTab: "overview",
  },
});
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoHeader {...args} />
  </svelte:fragment>
</Story>

<Story name="Full Featured Repo">
  <RepoHeader
    event={{
      id: "repo2",
      pubkey: "npub1alicepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7,
      kind: 30617,
      content: "A decentralized git collaboration platform.",
      tags: [
        ["d", "nostr-git"],
        ["name", "nostr-git"],
        ["description", "A decentralized git collaboration platform."],
        ["web", "https://nostr.git"],
        ["clone", "git://nostr.git"],
        ["relays", "wss://relay.nostr.git"],
        ["maintainers", "npub1alicepubkey", "npub1bobpubkey"],
        ["t", "decentralized"],
        ["t", "git"],
        ["t", "nostr"],
      ],
      sig: "testsig2",
    }}
    owner={{
      name: "Alice",
      picture: "https://i.pravatar.cc/40?u=alice",
      display_name: "Alice Cooper",
      nip05: "alice@example.com",
      lud16: "alice@getalby.com",
      about: "Lead maintainer of nostr-git.",
      website: "https://alice.com"
    }}
    activeTab="overview"
  />
</Story>

<Story name="Minimal Repo">
  <RepoHeader
    event={{
      id: "repo1",
      pubkey: "npub1bobpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30,
      kind: 30617,
      content: "A minimal repo.",
      tags: [
        ["d", "tiny-repo"],
        ["name", "tiny-repo"],
        ["description", "A minimal repo."],
      ],
      sig: "testsig1",
    }}
    owner={{ name: "Bob", picture: "https://i.pravatar.cc/40?u=bob" }}
    activeTab="overview"
  />
</Story>
