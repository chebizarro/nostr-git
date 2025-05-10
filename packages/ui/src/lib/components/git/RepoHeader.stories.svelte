<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoHeader from "./RepoHeader.svelte";
  import RepoTab from "./RepoTab.svelte";
  import { FileCode, GitBranch, CircleAlert, GitPullRequest, Book } from "@lucide/svelte";
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
    <RepoHeader {...args}>
      {#snippet children()}
        <RepoTab tabValue="overview" label="Overview" href="/repo/overview">
          {#snippet icon()}
            <FileCode class="h-4 w-4" />
          {/snippet}
        </RepoTab>
        <RepoTab tabValue="code" label="Code" href="/repo/code">
          {#snippet icon()}
            <GitBranch class="h-4 w-4" />
          {/snippet}
        </RepoTab>
        <RepoTab tabValue="issues" label="Issues" href="/repo/issues">
          {#snippet icon()}
            <CircleAlert class="h-4 w-4" />
          {/snippet}
        </RepoTab>
        <RepoTab tabValue="patches" label="Patches" href="/repo/patches">
          {#snippet icon()}
            <GitPullRequest class="h-4 w-4" />
          {/snippet}
        </RepoTab>
        <RepoTab tabValue="wiki" label="Wiki" href="/repo/wiki">
          {#snippet icon()}
            <Book class="h-4 w-4" />
          {/snippet}
        </RepoTab>
      {/snippet}
    </RepoHeader>
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
      website: "https://alice.com",
    }}
    activeTab="overview"
  >
    {#snippet children(activeTab)}
      <RepoTab tabValue="overview" label="Overview" href="/repo/overview" {activeTab}>
        {#snippet icon()}
          <FileCode class="h-4 w-4" />
        {/snippet}
      </RepoTab>
      <RepoTab tabValue="code" label="Code" href="/repo/code" {activeTab}>
        {#snippet icon()}
          <GitBranch class="h-4 w-4" />
        {/snippet}
      </RepoTab>
      <RepoTab tabValue="issues" label="Issues" href="/repo/issues" {activeTab}>
        {#snippet icon()}
          <CircleAlert class="h-4 w-4" />
        {/snippet}
      </RepoTab>
      <RepoTab tabValue="patches" label="Patches" href="/repo/patches" {activeTab}>
        {#snippet icon()}
          <GitPullRequest class="h-4 w-4" />
        {/snippet}
      </RepoTab>
      <RepoTab tabValue="wiki" label="Wiki" href="/repo/wiki">
        {#snippet icon()}
          <Book class="h-4 w-4" />
        {/snippet}
      </RepoTab>
    {/snippet}
  </RepoHeader>
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
  >
    {#snippet children()}
      <RepoTab tabValue="overview" label="Overview" href="/repo/overview">
        {#snippet icon()}
          <FileCode class="h-4 w-4" />
        {/snippet}
      </RepoTab>
      <RepoTab tabValue="code" label="Code" href="/repo/code">
        {#snippet icon()}
          <GitBranch class="h-4 w-4" />
        {/snippet}
      </RepoTab>
      <RepoTab tabValue="issues" label="Issues" href="/repo/issues">
        {#snippet icon()}
          <CircleAlert class="h-4 w-4" />
        {/snippet}
      </RepoTab>
    {/snippet}
  </RepoHeader>
</Story>
