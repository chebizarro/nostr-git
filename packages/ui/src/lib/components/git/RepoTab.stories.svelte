<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoTab from "./RepoTab.svelte";
  import { FileCode, GitBranch, CircleAlert } from "@lucide/svelte";
  const { Story } = defineMeta({
    title: "RepoTab",
    component: RepoTab,
    argTypes: {
      tabValue: { control: "text", defaultValue: "overview" },
      label: { control: "text", defaultValue: "Overview" },
      href: { control: "text", defaultValue: "/repo/overview" },
    },
    args: {
      tabValue: "overview",
      label: "Overview",
      href: "/repo/overview",
    },
  });
</script>

<Story name="Controls" let:args>
  <RepoTab {...args}>
    {#snippet icon()}
      <FileCode class="h-4 w-4" />
    {/snippet}
  </RepoTab>
</Story>

<Story name="Default">
  <div class="grid grid-cols-6 mb-0">
    <RepoTab tabValue="overview" label="Overview" href="/repo/overview">
      {#snippet icon()}
        <FileCode class="h-4 w-4" />
      {/snippet}
    </RepoTab>
    <RepoTab tabValue="code" label="Code" href="/repo/code">
      {#snippet icon()}
        <GitBranch class="h-4 w-4" />
      {/snippet}
    </RepoTab>
    <RepoTab tabValue="issues" label="Issues" href="/repo/issues">
      {#snippet icon()}
        <CircleAlert class="h-4 w-4" />
      {/snippet}
    </RepoTab>
  </div>
</Story>
