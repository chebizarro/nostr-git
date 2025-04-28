<script lang="ts">
	import { TabsContent } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = TabsPrimitive.ContentProps;

	let className: $$Props["class"] = undefined;
	export let value: $$Props["value"];
	export { className as class };
</script>

<TabsContent
	class={cn(
		"ring-offset-background focus-visible:ring-ring mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
		className
	)}
	{value}
	{...$props()}
>
	<slot />
</TabsContent>
