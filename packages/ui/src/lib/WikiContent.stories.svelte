<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import WikiContent from './WikiContent.svelte';
  const { Story } = defineMeta({
    title: 'WikiContent',
    component: WikiContent,
    argTypes: {
      content: { control: 'text' },
      pageId: { control: 'text' },
    },
    args: {
      content: '# Welcome\nThis is the wiki page.',
      pageId: '1',
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <WikiContent {...args} />
  </svelte:fragment>
</Story>

<Story name="Another Page">
  <WikiContent content="## Another Page\nMore content here." pageId="2" />
</Story>
