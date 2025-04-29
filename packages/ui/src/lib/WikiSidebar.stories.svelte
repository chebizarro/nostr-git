<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import WikiSidebar from './WikiSidebar.svelte';
  const { Story } = defineMeta({
    title: 'WikiSidebar',
    component: WikiSidebar,
    argTypes: {
      selectedPage: { control: 'text' },
      onSelectPage: { action: 'selectPage' },
    },
    args: {
      selectedPage: '1',
      onSelectPage: () => {},
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <WikiSidebar {...args} />
  </svelte:fragment>
</Story>

<Story name="Different Selected Page">
  <WikiSidebar selectedPage="3" onSelectPage={() => {}} />
</Story>
