<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ThreadComposer from "./ThreadComposer.svelte";

  const { Story } = defineMeta({
    title: "ThreadComposer",
    component: ThreadComposer,
    argTypes: {
      onSubmit: { action: "submitted" },
    },
    args: {
      onSubmit: () => {},
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ThreadComposer on:submit={args.onSubmit} />
  </svelte:fragment>
</Story>

<Story name="Default">
  <ThreadComposer on:submit={onSubmit} />
</Story>

<Story name="WithSubmitAction">
  <ThreadComposer on:submit={onSubmit} />
</Story>
