<script lang="ts">
import type { Snippet } from "svelte";

const base = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline"
};

const sizeClasses = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10"
};

const {
  children,
  onclick,
  type = "button",
  variant = "default",
  size = "default",
  class: userClass = "",
  style = '',
  disabled = false,
  "data-tip": dataTip
}: {
  children: Snippet;
  onclick?: (event: Event) => any;
  type?: "button" | "submit";
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  class?: string;
  style?: string;
  disabled?: boolean;
  "data-tip"?: string;
} = $props();

const className = $derived(() => [base, variantClasses[variant] ?? variantClasses.default, sizeClasses[size] ?? sizeClasses.default, userClass].join(" "));


function handleClick(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  onclick?.(event);
}
</script>

  
  <button
  type={type as "button" | "submit"}
  class={className}
  style={style}
  disabled={disabled}
  data-tip={dataTip}
  onclick={handleClick}
>
  {@render children?.()}
</button>

  