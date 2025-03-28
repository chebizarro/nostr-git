<script lang="ts">
	import { fetchSnippet, parsePermalink } from './parsePermalink.js';
	import { Buffer } from 'buffer';

	// For some environments, we may need to define window.Buffer
	if (typeof window !== 'undefined' && !window.Buffer) {
		(window as any).Buffer = Buffer;
	}

	let permalinkText = '';
	let snippetContent = '';
	let errorMessage = '';
	let loading = false;

	async function handlePermalink() {
		snippetContent = '';
		errorMessage = '';

		const parsed = parsePermalink(permalinkText.trim());
		if (!parsed) {
			errorMessage = 'Not a valid GitHub/GitLab/Gitea permalink.';
			return;
		}

		loading = true;
		try {
			snippetContent = await fetchSnippet(parsed);
		} catch (err) {
			if (err instanceof Error) {
				return `Error: ${err.message}`;
			} else {
				return `An unknown error ${err} occurred.`;
			}
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
			placeholder="https://github.com/user/repo/blob/main/path/to/file.ts#L10-L20"
		>
		</textarea>
	</label>

	<div class="button-row">
		<button on:click={handlePermalink} disabled={loading}>Fetch Snippet</button>
	</div>

	{#if loading}
		<p>Loading...</p>
	{:else if errorMessage}
		<pre class="error">{errorMessage}</pre>
	{:else if snippetContent}
		<pre class="snippet">{snippetContent}</pre>
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
	.button-row {
		display: flex;
		gap: 1rem;
	}
	.error {
		color: red;
		background: #ffd3d3;
		padding: 0.5rem;
	}
	.snippet {
		background-color: #f2f2f2;
		padding: 1rem;
		white-space: pre;
		overflow: auto;
	}
</style>
