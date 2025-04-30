<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import RepoThreadView from "./RepoThreadView.svelte";
  const { Story } = defineMeta({
    title: "RepoThreadView",
    component: RepoThreadView,
    argTypes: {
      threadId: { control: "text" },
      repoId: { control: "text" },
      type: { control: { type: "select" }, options: ["issue", "patch", "discussion"] },
    },
    args: {
      threadId: "t1",
      repoId: "repo-1",
      type: "issue",
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <RepoThreadView {...args} />
  </svelte:fragment>
</Story>

<Story name="Patch Thread">
  <RepoThreadView threadId="t2" repoId="repo-2" type="patch" />
</Story>
