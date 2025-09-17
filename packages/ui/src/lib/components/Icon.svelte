<!--
  Icon.svelte
  Placeholder Icon component for the nostr-git/ui package
  This should be replaced with the actual Icon component from the main app
-->
<script lang="ts">
  interface Props {
    name: string;
    class?: string;
    size?: number | string;
  }

  let { name, class: className = "", size = 16 }: Props = $props();

  // Simple icon mapping - this should be replaced with actual icon implementation
  const iconMap: Record<string, string> = {
    "git-repository": "📁",
    "git-branch": "🌿",
    "git-pull-request": "🔀",
    "issue-opened": "🔓",
    "issue-closed": "🔒",
    "message-circle": "💬",
    "help-circle": "❓",
    copy: "📋",
    "git-merge": "🔀",
    "git-pull-request-draft": "📝",
    "alert-circle": "⚠️",
    user: "👤",
    calendar: "📅",
    mail: "📧",
    lock: "🔒",
  };

  const iconSymbol = $derived(iconMap[name] || "❓");
</script>

<span
  class="inline-flex items-center justify-center {className}"
  style="font-size: {typeof size === 'number' ? size + 'px' : size};"
  title={name}
>
  {iconSymbol}
</span>

<style>
  span {
    /* Basic icon styling */
    line-height: 1;
    vertical-align: middle;
  }
</style>
