<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import RepoSocialSidebar from './RepoSocialSidebar.svelte';
  const { Story } = defineMeta({
    title: 'RepoSocialSidebar',
    component: RepoSocialSidebar,
    argTypes: {
      watchers: { control: 'number' },
      contributors: { control: 'object' },
    },
    args: {
      watchers: 42,
      contributors: [
        { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
        { name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' },
      ],
    }
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoSocialSidebar {...args} />
  </svelte:fragment>
</Story>

<Story name="Many Contributors">
  <RepoSocialSidebar
    watchers={100}
    contributors={[
      { name: 'Alice', avatar: 'https://i.pravatar.cc/40?u=alice' },
      { name: 'Bob', avatar: 'https://i.pravatar.cc/40?u=bob' },
      { name: 'Carol', avatar: 'https://i.pravatar.cc/40?u=carol' },
      { name: 'Dave', avatar: 'https://i.pravatar.cc/40?u=dave' },
      { name: 'Eve', avatar: 'https://i.pravatar.cc/40?u=eve' },
    ]}
  />
</Story>
