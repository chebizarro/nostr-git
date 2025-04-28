<script lang="ts">
	import { Button } from "./index.js";
	import { type Events, type Props, buttonVariants } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = Props;
	type $$Events = Events;

	let className: $$Props["class"] = undefined;
	// TODO: Refactor for runes mode: use $props() for variant, size, builders, and className if needed.
</script>

<Button
	{builders}
	class={cn(buttonVariants({ variant, size, className }))}
	type="button"
	{...$props()}
	on:click
	on:keydown
>
	<slot />
</Button>
