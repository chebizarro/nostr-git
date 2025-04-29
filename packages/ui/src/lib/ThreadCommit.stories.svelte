<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ThreadCommit from './ThreadCommit.svelte';
  const { Story } = defineMeta({
    title: 'ThreadCommit',
    component: ThreadCommit,
    argTypes: {
      content: { control: 'text' },
      author: { control: 'object', defaultValue: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' } },
      createdAt: { control: 'date' },
      metadata: { control: 'object', defaultValue: { hash: 'abc123' } },
    },
    args: {
      content: 'Initial commit',
      author: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      createdAt: new Date().toISOString(),
      metadata: { hash: 'abc123' },
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadCommit {...args} />
  </svelte:fragment>
</Story>

<Story name="With Custom Hash">
  <ThreadCommit
    content="Refactor codebase"
    author={{ name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    metadata={{ hash: 'def456' }}
  />
</Story>
