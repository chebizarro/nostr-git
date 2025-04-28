<script lang="ts">
	import { Avatar } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = AvatarPrimitive.Props;

	let className: $$Props["class"] = undefined;
	export let delayMs: $$Props["delayMs"] = undefined;
	export { className as class };
</script>

<Avatar
	class={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
	{...$props()}
>
	<slot />
</Avatar>
