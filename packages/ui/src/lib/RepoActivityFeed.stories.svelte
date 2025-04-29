<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import RepoActivityFeed from './RepoActivityFeed.svelte';
  const { Story } = defineMeta({
    title: 'RepoActivityFeed',
    component: RepoActivityFeed,
    argTypes: {
      activities: { control: 'object' },
    },
    args: {
      activities: [
        {
          id: 'a1',
          type: 'commit',
          title: 'Initial commit',
          user: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'a2',
          type: 'star',
          title: 'Starred by Bob',
          user: { name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' },
          timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        },
      ],
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoActivityFeed {...args} />
  </svelte:fragment>
</Story>

<Story name="No Activity">
  <RepoActivityFeed activities={[]} />
</Story>
