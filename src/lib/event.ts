import { nip19, SimplePool, type EventTemplate, type NostrEvent } from 'nostr-tools';
import { fetchSnippet, parsePermalink, type PermalinkData } from './parsePermalink.js';

export type HexString = Uint8Array<ArrayBufferLike>;

/**
 * Creates a NIP-34 permalink event from a URL
 *
 * @param permalink - The permalink, as copied directly from GitHub/Gitea/GitLab.
 * @param sk - The secret key to sign the event with.
 * @param relays - The relays to query for existing git repos
 * @returns a signed permalink @NostrEvent
 */
export async function createEventFromPermalink(
	permalink: string,
	signer: (event: EventTemplate) => Promise<NostrEvent>,
	relays: string[]
): Promise<NostrEvent> {
	const linkData = parsePermalink(permalink);
	if (!linkData) {
		throw new Error(`Could not parse permalink: ${permalink}`);
	}
	const exists = await permalinkEventExists(linkData, relays);
	if (exists) {
		return exists;
	}
	const eventTemplate = await createEvent(linkData, relays);
	return signer(eventTemplate);
}

export async function createNeventFromPermalink(
	permalink: string,
	signer: (event: EventTemplate) => Promise<NostrEvent>,
	relays: string[]
): Promise<string> {

	const event = await createEventFromPermalink(permalink, signer, relays);

	const pool = new SimplePool();

	pool.publish(relays, event);

	const nevent = nip19.neventEncode({
		id: event.id,
		relays,
		author: event.pubkey,
		kind: event.kind
	});
	return `nostr:${nevent}`;
}

async function createEvent(eventData: PermalinkData, relays: string[]): Promise<EventTemplate> {
	const content = await fetchSnippet(eventData);

	const tags: string[][] = [
		['repo', `https://${eventData.host}/${eventData.owner}/${eventData.repo}.git`],
		['branch', eventData.branch],
		['file', eventData.filePath]
	];

	if (eventData.startLine) {
		const lineTag = ['lines', `${eventData.startLine}`];
		if (eventData.endLine) {
			lineTag.push(`${eventData.endLine}`);
		}
		tags.push(lineTag);
	}

	// if we have a valid repo name, attempt to link the repository event (kind 30617)
	// e.g. storing a reference to it in an 'a' tag if found
	if (eventData.repo) {
		const repoEvent = await fetchRepoEvent(eventData, relays);
		if (repoEvent) {
			// if there's a 'd' tag
			const repoId = repoEvent.tags.find((t) => t[0] === 'd');
			if (repoId) {
				tags.push(['a', `30617:${repoEvent.pubkey}:${repoId[1]}`]);
			}
		}
	}

	return {
		kind: 1623,
		created_at: Math.floor(Date.now() / 1000),
		tags,
		content
	};
}

async function fetchRepoEvent(
	linkData: PermalinkData,
	relays: string[]
): Promise<NostrEvent | undefined> {
	const pool = new SimplePool();
	try {
		const events = await pool.querySync(relays, {
			kinds: [30617],
			'#d': [linkData.repo]
		});
		pool.close(relays);
		// find event referencing a 'clone' tag that includes "owner/repo"
		const found = events.find((evt) =>
			evt.tags.some((t) => t[0] === 'clone' && t[1].includes(`${linkData.owner}/${linkData.repo}`))
		);
		return found;
	} catch (err) {
		console.error('fetchRepoEvent failed:', err);
		return undefined;
	}
}

async function permalinkEventExists(
	linkData: PermalinkData,
	relays: string[]
): Promise<NostrEvent | undefined> {
	const pool = new SimplePool();
	try {
		const events = await pool.querySync(relays, {
			kinds: [1623],
			'#a': [linkData.repo] // searching for 'a' tag that matches repo
		});
		pool.close(relays);

		// filter or find an event that has matching branch, file, lines
		const found = events.find((evt) => {
			const hasBranch = evt.tags.some((t) => t[0] === 'branch' && t[1] === linkData.branch);
			const hasFile = evt.tags.some((t) => t[0] === 'file' && t[1] === linkData.filePath);

			// handle optional line range
			if (linkData.startLine) {
				const hasStart = evt.tags.some(
					(t) => t[0] === 'lines' && t[1] === linkData.startLine!.toString()
				);
				if (!hasStart) return false;

				// if endLine also present, check for lines[2] = linkData.endLine
				if (linkData.endLine) {
					// The "lines" tag might store them as [ 'lines', start, end ]
					const hasEnd = evt.tags.some(
						(t) => t[0] === 'lines' && t[2] === linkData.endLine!.toString()
					);
					if (!hasEnd) return false;
				}
			}

			return hasBranch && hasFile;
		});
		return found;
	} catch (err) {
		console.error('permalinkEventExists error:', err);
		return undefined;
	}
}
