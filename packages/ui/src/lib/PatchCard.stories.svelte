<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import PatchCard from './PatchCard.svelte';
  const { Story } = defineMeta({
    title: 'PatchCard',
    component: PatchCard,
    argTypes: {
      patchId: { control: 'text' },
      title: { control: 'text' },
      description: { control: 'text' },
      author: { control: 'object', defaultValue: { name: 'Dave', avatar: 'https://i.pravatar.cc/40?u=dave' } },
      baseBranch: { control: 'text' },
      commitCount: { control: 'number' },
      commentCount: { control: 'number' },
      createdAt: { control: 'date' },
      status: { control: { type: 'select' }, options: ['open', 'merged', 'closed'] },
    },
    args: {
      patchId: 'p1',
      title: 'Add dark mode',
      description: 'Implements dark mode for all UI components.',
      author: { name: 'Dave', avatar: 'https://i.pravatar.cc/40?u=dave' },
      baseBranch: 'main',
      commitCount: 3,
      commentCount: 1,
      createdAt: new Date().toISOString(),
      status: 'open',
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <PatchCard {...args} />
  </svelte:fragment>
</Story>

<Story name="Merged Patch">
  <PatchCard
    patchId="p2"
    title="Refactor backend"
    description="Major refactor of backend logic."
    author={{ name: 'Eve', avatar: 'https://i.pravatar.cc/40?u=eve' }}
    baseBranch="dev"
    commitCount={10}
    commentCount={5}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()}
    status="merged"
  />
</Story>
