<script lang="ts">
  import { Separator as SeparatorPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    orientation = "horizontal",
    ...restProps
  }: SeparatorPrimitive.RootProps = $props();
</script>

<SeparatorPrimitive.Root
  bind:ref={ref}
  class={cn(
    orientation === "horizontal"
      ? "border-t my-4 w-full shrink-0 bg-border h-[1px]"
      : "min-h-full w-[1px] border-t my-4 shrink-0 bg-border",
    className
  )}
  orientation={orientation}
  {...restProps}
/>
