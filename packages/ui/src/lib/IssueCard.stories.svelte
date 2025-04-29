<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import IssueCard from './IssueCard.svelte';
  const { Story } = defineMeta({
    title: 'IssueCard',
    component: IssueCard,
    argTypes: {
      id: { control: 'text', description: 'Issue ID' },
      repoId: { control: 'text', description: 'Repo ID' },
      title: { control: 'text' },
      description: { control: 'text' },
      author: {
        control: 'object',
        defaultValue: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      },
      labels: { control: 'object' },
      commentCount: { control: 'number' },
      createdAt: { control: 'date' },
      status: { control: { type: 'select' }, options: ['open', 'closed', 'resolved'] },
    },
    args: {
      id: 'demo',
      repoId: 'repo-demo',
      title: 'Demo Issue',
      description: 'This is a demo issue for controls.',
      author: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      labels: ['demo'],
      commentCount: 0,
      createdAt: new Date().toISOString(),
      status: 'open',
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <IssueCard {...args} />
  </svelte:fragment>
</Story>

<Story name="Open Issue">
  <IssueCard
    id="1"
    repoId="repo-1"
    title="Bug: Save button not working"
    description="When clicking save, nothing happens. Expected to persist changes."
    author={{ name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' }}
    labels={["bug", "urgent"]}
    commentCount={2}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString()}
    status="open"
  />
</Story>

<Story name="Closed Issue with Labels">
  <IssueCard
    id="2"
    repoId="repo-2"
    title="Feature: Add dark mode"
    description="Users have requested a dark theme for better night-time usability."
    author={{ name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' }}
    labels={["feature", "enhancement"]}
    commentCount={5}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    status="closed"
  />
</Story>

<Story name="Resolved, Bookmarked">
  <IssueCard
    id="3"
    repoId="repo-3"
    title="Refactor: Simplify reducer logic"
    description="Refactored the main reducer for improved readability."
    author={{ name: 'Carol', avatar: 'https://i.pravatar.cc/40?u=carol' }}
    labels={[]}
    commentCount={1}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()}
    status="resolved"
  />
</Story>

<Story name="Long Description & Many Labels">
  <IssueCard
    id="4"
    repoId="repo-4"
    title="Epic: Overhaul onboarding flow"
    description="This is a very long description meant to test how the card handles lots of text. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque euismod, nisi vel consectetur euismod, nisl nisi consectetur nisi, euismod euismod nisi nisi euismod nisi."
    author={{ name: 'Dave', avatar: 'https://i.pravatar.cc/40?u=dave' }}
    labels={["epic", "UX", "frontend", "high-priority", "needs-design", "discussion"]}
    commentCount={10}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()}
    status="open"
  />
</Story>

<Story name="No Labels, No Comments">
  <IssueCard
    id="5"
    repoId="repo-5"
    title="Chore: Update dependencies"
    description="Routine dependency update."
    author={{ name: 'Eve', avatar: 'https://i.pravatar.cc/40?u=eve' }}
    labels={[]}
    commentCount={0}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()}
    status="open"
  />
</Story>

<Story name="Edge: Missing Avatar">
  <IssueCard
    id="6"
    repoId="repo-6"
    title="Edge Case: No avatar"
    description="This issue has no avatar set for the author."
    author={{ name: 'Frank', avatar: '' }}
    labels={["edge"]}
    commentCount={1}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString()}
    status="open"
  />
</Story>

