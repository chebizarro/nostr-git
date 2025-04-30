<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import LiveSessionCard from "./LiveSessionCard.svelte";
  const { Story } = defineMeta({
    title: "LiveSessionCard",
    component: LiveSessionCard,
    argTypes: {
      sessionId: { control: "text" },
      title: { control: "text" },
      host: {
        control: "object",
        defaultValue: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
      },
      participants: { control: "object" },
      startedAt: { control: "date" },
      isActive: { control: "boolean" },
    },
    args: {
      sessionId: "sess-1",
      title: "Weekly Planning",
      host: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
      participants: [
        { name: "Bob", avatar: "https://i.pravatar.cc/40?u=bob" },
        { name: "Carol", avatar: "https://i.pravatar.cc/40?u=carol" },
      ],
      startedAt: new Date().toISOString(),
      isActive: true,
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <LiveSessionCard {...args} />
  </svelte:fragment>
</Story>

<Story name="Inactive Session">
  <LiveSessionCard
    sessionId="sess-2"
    title="Retro Meeting"
    host={{ name: "Dave", avatar: "https://i.pravatar.cc/40?u=dave" }}
    participants={[]}
    startedAt={new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()}
    isActive={false}
  />
</Story>
