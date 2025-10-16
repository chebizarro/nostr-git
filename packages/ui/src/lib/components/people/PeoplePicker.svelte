<script lang="ts">
	import { onDestroy } from "svelte";
	import UserAvatar from "../UserAvatar.svelte";
	import UserProfile from "../UserProfile.svelte";
	import { nip19 } from "nostr-tools";

	export interface PersonProfile {
		name?: string;
		picture?: string;
		nip05?: string;
		display_name?: string;
	}

	export interface PersonSuggestion extends PersonProfile {
		pubkey: string;
	}

	export interface Props {
		selected?: string[];
		placeholder?: string;
		disabled?: boolean;
		maxSelections?: number;
		showAvatars?: boolean;
		compact?: boolean;
		suggestionLimit?: number;
		getProfile?: (pubkey: string) => Promise<PersonProfile | null>;
		searchProfiles?: (query: string) => Promise<PersonSuggestion[]>;
		add?: (pubkey: string) => void | Promise<void>;
		remove?: (pubkey: string) => void | Promise<void>;
	}

	const {
		selected = $bindable(),
		placeholder = "Search for people...",
		disabled = false,
		maxSelections = 10,
		showAvatars = true,
		compact = false,
		suggestionLimit = 10,
		getProfile,
		searchProfiles,
		add,
		remove
	}: Props = $props();

	let inputValue = $state("");
	let suggestions = $state<PersonSuggestion[]>([]);
	let open = $state(false);
	let highlighted = $state(-1);
	let loading = $state(false);
	let profileCache = $state(new Map<string, PersonProfile>());

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!searchProfiles) return;
		const query = inputValue.trim();
		if (searchTimeout) clearTimeout(searchTimeout);
		if (!query) {
			suggestions = [];
			open = false;
			return;
		}
		searchTimeout = setTimeout(async () => {
			loading = true;
			try {
				const res = await searchProfiles(query);
				suggestions = res.slice(0, suggestionLimit);
				open = suggestions.length > 0;
			} catch (e) {
				console.error('searchProfiles failed', e);
				suggestions = [];
				open = false;
			} finally {
				loading = false;
			}
		}, 300);
	});

	onDestroy(() => {
		if (searchTimeout) clearTimeout(searchTimeout);
	});

	function normalizePubkey(input: string): string {
		if (input.startsWith('npub')) {
			try {
				const decoded = nip19.decode(input);
				if (decoded.type === 'npub') {
					return decoded.data;
				}
			} catch (e) {
				console.warn('Failed to decode npub:', e);
			}
		}
		return input;
	}

	async function ensureProfile(pubkey: string) {
		if (!getProfile || profileCache.has(pubkey)) return;
		try {
			const prof = await getProfile(pubkey);
			if (prof) {
				profileCache.set(pubkey, prof);
				profileCache = new Map(profileCache);
			}
		} catch (e) {
			console.warn('getProfile failed', e);
		}
	}

	function addSelection(pubkey: string) {
		const normalized = normalizePubkey(pubkey);
		if (selected.includes(normalized) || selected.length >= maxSelections) return;
		
		selected.push(normalized);
		add?.(normalized);
		
		// Dispatch change event
		const event = new CustomEvent('change', {
			detail: { selected: [...selected] }
		});
		document.dispatchEvent(event);
	}

	function removeSelection(pubkey: string) {
		const normalized = normalizePubkey(pubkey);
		const index = selected.indexOf(normalized);
		if (index > -1) {
			selected.splice(index, 1);
		}
		remove?.(normalized);
		
		// Dispatch change event
		const event = new CustomEvent('change', {
			detail: { selected: [...selected] }
		});
		document.dispatchEvent(event);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlighted = Math.min(highlighted + 1, suggestions.length - 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlighted = Math.max(highlighted - 1, -1);
				break;
			case 'Enter':
				e.preventDefault();
				if (highlighted >= 0 && suggestions[highlighted]) {
					addSelection(suggestions[highlighted].pubkey);
					inputValue = "";
					open = false;
					highlighted = -1;
				}
				break;
			case 'Escape':
				e.preventDefault();
				open = false;
				highlighted = -1;
				break;
			case 'Backspace':
				if (!inputValue && selected.length > 0) {
					e.preventDefault();
					removeSelection(selected[selected.length - 1]);
				}
				break;
		}
	}

	// Ensure profiles are cached for selected and suggestions
	$effect(() => {
		[...selected, ...suggestions.map(s => s.pubkey)].forEach(pubkey => {
			ensureProfile(pubkey);
		});
	});
</script>

<div class="space-y-2">
	<!-- Selected people -->
	{#if selected.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each selected as pubkey}
				<div class="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2 text-sm">
					{#if showAvatars}
						<UserAvatar pubkey={pubkey} profile={profileCache.get(pubkey)} size="sm" />
					{:else}
						<span class="text-gray-300">{pubkey.slice(0, 8)}...</span>
					{/if}
					<div class="flex-1 min-w-0">
						<div class="text-white text-sm truncate">
							{(() => {
								const profile = profileCache.get(pubkey);
								return profile?.display_name || profile?.name || profile?.nip05 || pubkey.slice(0, 16) + '...';
							})()}
						</div>
					</div>
					{#if !disabled}
						<button
							onclick={() => removeSelection(pubkey)}
							class="text-gray-400 hover:text-gray-200 transition-colors"
							aria-label="Remove {pubkey}"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Search input -->
	{#if selected.length < maxSelections}
		<div class="relative">
			<input
				bind:value={inputValue}
				onkeydown={onKeydown}
				onfocus={() => open = suggestions.length > 0}
				onblur={() => setTimeout(() => open = false, 150)}
				{placeholder}
				{disabled}
				class="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				aria-expanded={open}
				aria-controls="suggestions-listbox"
				aria-haspopup="listbox"
				role="combobox"
				aria-autocomplete="list"
			/>
			
			{#if loading}
				<div class="absolute right-3 top-1/2 transform -translate-y-1/2">
					<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400"></div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Suggestions dropdown -->
	{#if open && suggestions.length > 0}
		<div class="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
			<ul id="suggestions-listbox" role="listbox" aria-label="Search suggestions">
				{#each suggestions as suggestion, index}
					<li role="option" aria-selected={index === highlighted}>
						<button
							type="button"
							class="w-full px-3 py-2 cursor-pointer hover:bg-gray-700 {index === highlighted ? 'bg-gray-700' : ''} text-left"
							onclick={() => {
								addSelection(suggestion.pubkey);
								inputValue = "";
								open = false;
								highlighted = -1;
							}}
						>
						<div class="flex items-center gap-3">
							{#if showAvatars}
								<UserAvatar pubkey={suggestion.pubkey} profile={profileCache.get(suggestion.pubkey)} size="sm" />
							{:else}
								<span class="text-gray-300">{suggestion.pubkey.slice(0, 8)}...</span>
							{/if}
							<div class="flex-1 min-w-0">
								<div class="text-white text-sm truncate">
									{suggestion.display_name || suggestion.name || suggestion.nip05 || suggestion.pubkey.slice(0, 16) + '...'}
								</div>
								{#if suggestion.nip05 && suggestion.nip05 !== suggestion.display_name && suggestion.nip05 !== suggestion.name}
									<div class="text-gray-400 text-xs truncate">{suggestion.nip05}</div>
								{/if}
							</div>
						</div>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	/* Ensure dropdown appears above other elements */
	.relative {
		position: relative;
	}
</style>