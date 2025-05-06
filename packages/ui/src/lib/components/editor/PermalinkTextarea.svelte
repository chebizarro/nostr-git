<script lang="ts">
  import { generateSecretKey } from "nostr-tools";
  import { createEventFromPermalink } from "./event.js";
  import { fetchPermalink } from "./git.js";
  import { Buffer } from "buffer";
  import { parsePermalink } from "./permalink.js";

  if (typeof window !== "undefined" && !window.Buffer) {
    (window as any).Buffer = Buffer;
  }

  let permalinkText = "";
  let snippetContent = "";
  let errorMessage = "";
  let loading = false;

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

<div class="container">
  <label>
    Paste a GitHub/GitLab/Gitea permalink:
    <textarea
      rows="3"
      bind:value={permalinkText}
      on:paste={handlePaste}
      placeholder="https://github.com/user/repo/blob/main/path/to/file.ts#L10-L20"
    >
    </textarea>
  </label>

  {#if loading}
    <p>Loading...</p>
  {:else if errorMessage}
    <pre class="error">{errorMessage}</pre>
  {/if}
</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 600px;
    margin: 1rem 0;
  }
  textarea {
    width: 100%;
    font-family: inherit;
  }
  .error {
    color: red;
    background: #ffd3d3;
    padding: 0.5rem;
  }
</style>
