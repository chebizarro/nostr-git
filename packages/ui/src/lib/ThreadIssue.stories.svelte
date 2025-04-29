<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ThreadIssue from './ThreadIssue.svelte';
  const { Story } = defineMeta({
    title: 'ThreadIssue',
    component: ThreadIssue,
    argTypes: {
      repoId: { control: 'text' },
      author: { control: 'object', defaultValue: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' } },
      createdAt: { control: 'date' },
      metadata: { control: 'object', defaultValue: { issueId: '1', title: 'Sample', description: 'Sample desc', labels: ['bug'], commentCount: 0, status: 'open' } },
    },
    args: {
      repoId: 'repo-1',
      author: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      createdAt: new Date().toISOString(),
      metadata: { issueId: '1', title: 'Sample', description: 'Sample desc', labels: ['bug'], commentCount: 0, status: 'open' },
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadIssue {...args} />
  </svelte:fragment>
</Story>

<Story name="Closed Issue">
  <ThreadIssue
    repoId="repo-2"
    author={{ name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    metadata={{ issueId: '2', title: 'Closed', description: 'Closed issue', labels: ['feature'], commentCount: 2, status: 'closed' }}
  />
</Story>
