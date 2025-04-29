<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import IssueThread from './IssueThread.svelte';
  const { Story } = defineMeta({
    title: 'IssueThread',
    component: IssueThread,
    argTypes: {
      issueId: { control: 'text' },
      repoId: { control: 'text' },
      author: { control: 'object', defaultValue: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' } },
      comments: { control: 'object' },
      createdAt: { control: 'date' },
      status: { control: { type: 'select' }, options: ['open', 'closed', 'resolved'] },
    },
    args: {
      issueId: '1',
      repoId: 'repo-1',
      author: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      comments: [
        { content: 'First comment', author: { name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' }, createdAt: new Date().toISOString() }
      ],
      createdAt: new Date().toISOString(),
      status: 'open',
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <IssueThread {...args} />
  </svelte:fragment>
</Story>

<Story name="Closed Thread">
  <IssueThread
    issueId="2"
    repoId="repo-2"
    author={{ name: 'Carol', avatar: 'https://i.pravatar.cc/40?u=carol' }}
    comments={[]}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    status="closed"
  />
</Story>
