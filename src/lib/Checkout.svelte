<script lang="ts">
	import git from 'isomorphic-git';
	import http from 'isomorphic-git/http/web';
	import LightningFS from '@isomorphic-git/lightning-fs';
	import { Buffer } from 'buffer';

	if (typeof window !== 'undefined' && !window.Buffer) {
		(window as any).Buffer = Buffer;
	}

	interface Props {
		owner: string;
		repo: string;
		branch: string;
		filePath: string;
	}

	let {
		owner = 'Pleb5',
		repo = 'flotilla-budabit',
		branch = 'master',
		filePath = 'README.md'
	}: Props = $props();

	let fileContent = $state('');

	async function partialCheckout() {
		const fs = new LightningFS(repo);
		const dir = '/';

		try {
			// Shallow clone with no checkout
			await git.clone({
				fs,
				http,
				dir,
				corsProxy: 'https://cors.isomorphic-git.org',
				url: `https://github.com/${owner}/${repo}.git`,
				ref: branch,
				singleBranch: true,
				depth: 1,
				noCheckout: true
			});

			// Resolve the commit OID for our branch
			const commitOid = await git.resolveRef({ fs, dir, ref: branch });

			// Read the commit’s tree so we can see if the file is present
			const { commit } = await git.readCommit({ fs, dir, oid: commitOid });

			const { tree } = await git.readTree({
				fs: fs,
				dir: dir,
				oid: commit.tree
			});

			const found = tree.find((entry) => entry.path === filePath);
			if (!found) {
				fileContent = `File not found: ${filePath}`;
				return;
			}

			// Checkout only that file
			await git.checkout({
				fs,
				dir,
				ref: branch,
				filepaths: [filePath]
			});

			// Read the contents of the partially checked out file
			const { blob } = await git.readBlob({
				fs,
				dir: dir,
				oid: commitOid,
				filepath: filePath
			});
			fileContent = Buffer.from(blob).toString('utf8');
		} catch (err) {
			fileContent = `Error: ${err.message}`;
		}
	}
</script>

<div class="form">
	<label>Owner <input bind:value={owner} /></label>
	<label>Repo <input bind:value={repo} /></label>
	<label>Branch <input bind:value={branch} /></label>
	<label>File <input bind:value={filePath} /></label>
	<button onclick={partialCheckout}>Fetch File</button>
</div>

<pre>{fileContent}</pre>

<style>
	.form {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.9rem;
	}
</style>
