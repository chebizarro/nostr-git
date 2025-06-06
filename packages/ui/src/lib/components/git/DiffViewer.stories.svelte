<script module>
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import DiffViewer from "./DiffViewer.svelte";
  import parseGitDiff from "parse-git-diff";
  import { parseGitPatch } from "parse-patch";

  const patch =
`diff --git a/newfile.md b/newfile.md
deleted file mode 100644
index aa39060..0000000
--- a/newfile.md
+++ /dev/null
@@ -1 +0,0 @@
-newfile
`;

  const parsed = parseGitPatch(patch);
  const diff = parsed[0].diff;

  console.log(parsed);

  const { Story } = defineMeta({
    title: "DiffViewer",
    component: DiffViewer,
    argTypes: {
      diff: { control: "text", description: "Diff string" },
      showLineNumbers: { control: "boolean" },
      comments: { control: "object" },
    },
    args: {
      diff: parseGitDiff(diff),
      showLineNumbers: true,
      comments: [
        {
          id: "demo",
          lineNumber: 1,
          content: "Demo comment",
          author: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });
</script>

<Story name="Controls">
  <svelte:fragment slot="controls" let:args>
    <DiffViewer {...args} />
  </svelte:fragment>
</Story>

<Story name="Single Line Addition">
  <DiffViewer
    diff={parseGitDiff("+ Added a new feature!")}
    comments={[
      {
        id: "c1",
        lineNumber: 1,
        content: "Nice addition!",
        author: { name: "Alice", avatar: "https://i.pravatar.cc/40?u=alice" },
        createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      },
    ]}
    showLineNumbers={true}
  />
</Story>

<Story name="Massive Refactor">
  <DiffViewer
    diff={parseGitDiff(
      `- old line 1\n- old line 2\n+ new line 1\n+ new line 2\n context line\n+ added line\n- removed line\n context again`
    )}
    comments={[
      {
        id: "c2",
        lineNumber: 3,
        content: "Check this logic!",
        author: { name: "Bob", avatar: "https://i.pravatar.cc/40?u=bob" },
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: "c3",
        lineNumber: 6,
        content: "Should we remove this?",
        author: { name: "Carol", avatar: "https://i.pravatar.cc/40?u=carol" },
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      },
    ]}
    showLineNumbers={true}
  />
</Story>

<Story name="Mixed Changes">
  <DiffViewer
    diff={parseGitDiff(
      ` context\n- removed\n+ added\n unchanged\n+ another addition\n- another removal`
    )}
    comments={[]}
    showLineNumbers={true}
  />
</Story>
