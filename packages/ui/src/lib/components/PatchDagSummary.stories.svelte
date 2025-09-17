<script lang="ts">
  import { Meta, Story } from "@storybook/addon-svelte-csf";
  import PatchDagSummary from "./PatchDagSummary.svelte";

  const smallArgs = {
    nodeCount: 3,
    roots: ["r1"],
    rootRevisions: [],
    edgesCount: 2,
    topParents: ["r1"],
    parentOutDegree: { r1: 2 },
    parentChildren: { r1: ["c1", "c2"] },
  };

  const mediumArgs = {
    nodeCount: 8,
    roots: ["p1", "p4"],
    rootRevisions: ["rr1"],
    edgesCount: 7,
    topParents: ["p1", "p2", "p4"],
    parentOutDegree: { p1: 3, p2: 2, p4: 2 },
    parentChildren: {
      p1: ["p2", "p3", "p5"],
      p2: ["p6", "p7"],
      p4: ["p8", "p9"],
    },
  };

  const emptyArgs = {
    nodeCount: 0,
    roots: [],
    rootRevisions: [],
    edgesCount: 0,
    topParents: [],
    parentOutDegree: {},
    parentChildren: {},
  };
</script>

<Meta title="Git/PatchDagSummary" component={PatchDagSummary} />

<Story name="SmallGraph" args={smallArgs}>
  <PatchDagSummary {...smallArgs} />
</Story>

<Story name="MediumGraph" args={mediumArgs}>
  <PatchDagSummary {...mediumArgs} />
</Story>

<Story name="EmptyGraph" args={emptyArgs}>
  <PatchDagSummary {...emptyArgs} />
</Story>
