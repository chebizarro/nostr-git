<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ConfigProvider from "./ConfigProvider.svelte";
  const { Story } = defineMeta({
    title: "ConfigProvider",
    component: ConfigProvider,
    argTypes: {
      config: { control: "object", defaultValue: { theme: "light", language: "en" } },
    },
    args: {
      config: { theme: "light", language: "en" },
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <ConfigProvider {...args} />
  </svelte:fragment>
</Story>

<Story name="Dark Theme">
  <ConfigProvider config={{ theme: "dark", language: "en" }} />
</Story>
