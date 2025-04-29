<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ThreadPatch from './ThreadPatch.svelte';
  const { Story } = defineMeta({
    title: 'ThreadPatch',
    component: ThreadPatch,
    argTypes: {
      repoId: { control: 'text' },
      author: { control: 'object', defaultValue: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' } },
      createdAt: { control: 'date' },
      metadata: { control: 'object', defaultValue: { patchId: 'p1', title: 'Patch', description: 'Patch desc', baseBranch: 'main', commitCount: 1, commentCount: 0, status: 'open' } },
    },
    args: {
      repoId: 'repo-1',
      author: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      createdAt: new Date().toISOString(),
      metadata: { patchId: 'p1', title: 'Patch', description: 'Patch desc', baseBranch: 'main', commitCount: 1, commentCount: 0, status: 'open' },
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadPatch {...args} />
  </svelte:fragment>
</Story>

<Story name="Merged Patch">
  <ThreadPatch
    repoId="repo-2"
    author={{ name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    metadata={{ patchId: 'p2', title: 'Merged', description: 'Merged patch', baseBranch: 'dev', commitCount: 3, commentCount: 2, status: 'merged' }}
  />
</Story>
