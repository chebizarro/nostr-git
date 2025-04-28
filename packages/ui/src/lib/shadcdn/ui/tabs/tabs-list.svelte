<script lang="ts">
	import { TabsList } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = TabsPrimitive.ListProps;

	let className: $$Props["class"] = undefined;
	export { className as class };
</script>

<TabsList
	class={cn(
		"bg-muted text-muted-foreground inline-flex h-10 items-center justify-center rounded-md p-1",
		className
	)}
	{...$props()}
>
	<slot />
</TabsList>
