<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import IssueCard from "./IssueCard.svelte";
  const { Story } = defineMeta({
    title: "IssueCard",
    component: IssueCard,
    argTypes: {
      event: { control: "object" },
    },
    args: {
      event: {
        id: "issue1",
        pubkey: "npub1alicepubkey",
        created_at: Math.floor(Date.now() / 1000),
        kind: 1621,
        content: "This is a demo issue for controls.",
        tags: [
          ["a", "repo-demo"],
          ["subject", "Demo Issue"],
          ["t", "demo"],
          ["committer", "npub1alicepubkey", "https://i.pravatar.cc/40?u=alice"],
          ["e", "comment1"],
          ["e", "comment2"],
        ],
        sig: "testsig",
      },
    },
  });

</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <IssueCard {...args} author={{
    name: "Alice",
    display_name: "Alice A.",
    picture: "https://i.pravatar.cc/40?u=alice"
  }} />
  </svelte:fragment>
</Story>

<Story name="Open Issue">
  <IssueCard
    event={{
      id: "issue1",
      pubkey: "npub1alicepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 3,
      kind: 1621,
      content: "Bug: Save button not working\nWhen clicking save, nothing happens. Expected to persist changes.",
      tags: [
        ["a", "repo-1"],
        ["subject", "Bug: Save button not working"],
        ["t", "bug"],
        ["t", "urgent"],
        ["e", "comment1"],
        ["e", "comment2"],
      ],
      sig: "testsig1",
    }}
    author={{
      name: "Alice",
      display_name: "Alice A.",
      picture: "https://i.pravatar.cc/40?u=alice"
    }}
  />
</Story>

<Story name="Closed Issue with Labels">
  <IssueCard
    event={{
      id: "issue2",
      pubkey: "npub1bobpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 24,
      kind: 1621,
      content: "Feature: Add dark mode\nUsers have requested a dark theme for better night-time usability.",
      tags: [
        ["a", "repo-2"],
        ["subject", "Feature: Add dark mode"],
        ["t", "feature"],
        ["t", "enhancement"],
        ["e", "comment1"],
        ["e", "comment2"],
        ["e", "comment3"],
        ["e", "comment4"],
        ["e", "comment5"],
        ["t", "closed"],
      ],
      sig: "testsig2",
    }}
    author={{
      name: "Bob",
      display_name: "Bob B.",
      picture: "https://i.pravatar.cc/40?u=bob"
    }}
  />
</Story>

<Story name="Resolved, Bookmarked">
  <IssueCard
    event={{
      id: "issue3",
      pubkey: "npub1carolpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 48,
      kind: 1621,
      content: "Refactor: Simplify reducer logic\nRefactored the main reducer for improved readability.",
      tags: [
        ["a", "repo-3"],
        ["subject", "Refactor: Simplify reducer logic"],
        ["t", "resolved"],
        ["e", "comment1"],
      ],
      sig: "testsig3",
    }}
    author={{
      name: "Carol",
      display_name: "Carol C.",
      picture: "https://i.pravatar.cc/40?u=carol"
    }}
  />
</Story>

<Story name="Long Description & Many Labels">
  <IssueCard
    event={{
      id: "issue4",
      pubkey: "npub1davepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 72,
      kind: 1621,
      content: "Epic: Overhaul onboarding flow\nThis is a very long description meant to test how the card handles lots of text. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque euismod, nisi vel consectetur euismod, nisl nisi consectetur nisi, euismod euismod nisi nisi euismod nisi.",
      tags: [
        ["a", "repo-4"],
        ["subject", "Epic: Overhaul onboarding flow"],
        ["t", "epic"],
        ["t", "UX"],
        ["t", "frontend"],
        ["t", "high-priority"],
        ["t", "needs-design"],
        ["t", "discussion"],
        ["e", "comment1"],
        ["e", "comment2"],
        ["e", "comment3"],
        ["e", "comment4"],
        ["e", "comment5"],
        ["e", "comment6"],
        ["e", "comment7"],
        ["e", "comment8"],
        ["e", "comment9"],
        ["e", "comment10"],
      ],
      sig: "testsig4",
    }}
    author={{
      name: "Dave",
      display_name: "Dave D.",
      picture: "https://i.pravatar.cc/40?u=dave"
    }}
  />
</Story>

<Story name="No Labels, No Comments">
  <IssueCard
    event={{
      id: "issue5",
      pubkey: "npub1evepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 5,
      kind: 1621,
      content: "Chore: Update dependencies\nRoutine dependency update.",
      tags: [
        ["a", "repo-5"],
        ["subject", "Chore: Update dependencies"],
      ],
      sig: "testsig5",
    }}
    author={{}}
  />
</Story>

<Story name="Full Profile Object">
  <IssueCard
    event={{
      id: "issue7",
      pubkey: "npub1gracepubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 96,
      kind: 1621,
      content: "Profile: Full Data\nThis story uses a full Profile object with all fields.",
      tags: [
        ["a", "repo-7"],
        ["subject", "Profile: Full Data"],
        ["t", "profile"],
        ["t", "test"],
        ["e", "comment1"],
        ["e", "comment2"],
        ["e", "comment3"],
      ],
      sig: "testsig7",
    }}
    author={{
      name: "Grace",
      display_name: "Grace Hopper",
      picture: "https://i.pravatar.cc/40?u=grace",
      nip05: "grace@nostr.com",
      lud16: "grace@getalby.com",
      about: "Pioneer of computing.",
      website: "https://gracehopper.com"
    }}
  />
</Story>

<Story name="Edge: Missing Avatar">
  <IssueCard
    event={{
      id: "issue6",
      pubkey: "npub1frankpubkey",
      created_at: Math.floor(Date.now() / 1000) - 60 * 60 * 10,
      kind: 1621,
      content: "Edge Case: No avatar\nThis issue has no avatar set for the author.",
      tags: [
        ["a", "repo-6"],
        ["subject", "Edge Case: No avatar"],
        ["t", "edge"],
        ["e", "comment1"],
      ],
      sig: "testsig6",
    }}
    author={{
      name: "Frank"
      // picture intentionally omitted to simulate missing avatar
    }}
  />
</Story>
