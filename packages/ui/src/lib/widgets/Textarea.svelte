<script lang="ts">
  export let value: string = '';
  export let className = '';
  export let style = '';
  export let placeholder = '';
</script>

<textarea
  class={className}
  style={style}
  bind:value
  placeholder={placeholder}
></textarea>
