<script lang="ts">
	import { AvatarFallback } from "./index.js";
	import { cn } from "$lib/utils.js";

	type $$Props = AvatarPrimitive.FallbackProps;

	let className: $$Props["class"] = undefined;
	export { className as class };
</script>

<AvatarFallback
	class={cn("bg-muted flex h-full w-full items-center justify-center rounded-full", className)}
	{...$props()}
>
	<slot />
</AvatarFallback>
