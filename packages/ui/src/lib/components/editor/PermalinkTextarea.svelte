<script lang="ts">
  import { generateSecretKey } from "nostr-tools";
  import { createEventFromPermalink, fetchPermalink, parsePermalink } from "@nostr-git/core";

  let permalinkText = $state("");
  let snippetContent = $state("");
  let errorMessage = $state("");
  let loading = $state(false);

  async function handlePermalink() {
    snippetContent = "";
    errorMessage = "";

    const parsed = parsePermalink(permalinkText.trim());
    if (!parsed) {
      errorMessage = "Not a valid GitHub/GitLab/Gitea permalink.";
      return;
    }
    console.log(parsed);
    await createEventFromPermalink(permalinkText.trim(), generateSecretKey(), [
      "wss://relay.damus.io",
    ]);
    loading = true;
    try {
      snippetContent = await fetchPermalink(parsed);
    } catch (err) {
      if (err instanceof Error) {
        return `Error: ${err.message}`;
      } else {
        return `An unknown error ${err} occurred.`;
      }
    }

    loading = false;
  }

  async function handlePaste(e: ClipboardEvent) {
    loading = true;
    const pastedText = e.clipboardData?.getData("text/plain") ?? "";

    e.preventDefault();

    const parsed = parsePermalink(pastedText.trim());
    if (parsed) {
      console.log("Permalink recognized:", parsed);
      const event = await createEventFromPermalink(pastedText.trim(), generateSecretKey(), [
        "wss://relay.damus.io",
      ]);

      permalinkText = event.content;
    } else {
      permalinkText = pastedText;
    }
    loading = false;
  }
</script>

<div class="flex flex-col gap-3 max-w-[600px] my-4">
  <label>
    Paste a GitHub/GitLab/Gitea permalink:
    <textarea
      rows="3"
      bind:value={permalinkText}
      onpaste={handlePaste}
      placeholder="https://github.com/user/repo/blob/main/path/to/file.ts#L10-L20"
      class="w-full font-inherit"
    >
    </textarea>
  </label>

  {#if loading}
    <p>Loading...</p>
  {:else if errorMessage}
    <pre class="text-red-600 bg-[#ffd3d3] p-2">{errorMessage}</pre>
  {/if}
</div>
