<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ThreadMessage from './ThreadMessage.svelte';
  const { Story } = defineMeta({
    title: 'ThreadMessage',
    component: ThreadMessage,
    argTypes: {
      content: { control: 'text' },
      author: { control: 'object', defaultValue: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' } },
      createdAt: { control: 'date' },
    },
    args: {
      content: 'This is a message',
      author: { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      createdAt: new Date().toISOString(),
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadMessage {...args} />
  </svelte:fragment>
</Story>

<Story name="Old Message">
  <ThreadMessage
    content="This is an old message"
    author={{ name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' }}
    createdAt={new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString()}
  />
</Story>
