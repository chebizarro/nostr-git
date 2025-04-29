<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import FileView from './FileView.svelte';
  const { Story } = defineMeta({
    title: 'FileView',
    component: FileView,
    argTypes: {
      name: { control: 'text' },
      path: { control: 'text' },
      type: { control: { type: 'select' }, options: ['file', 'directory'] },
      content: { control: 'text' },
      isExpanded: { control: 'boolean' },
    },
    args: {
      name: 'README.md',
      path: 'docs/README.md',
      type: 'file',
      content: '# Welcome to nostr-git!\nThis is the README.',
      isExpanded: false,
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <FileView {...args} />
  </svelte:fragment>
</Story>

<Story name="Directory View">
  <FileView
    name="src"
    path="src/"
    type="directory"
    content=""
    isExpanded={true}
  />
</Story>
