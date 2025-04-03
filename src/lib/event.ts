import { finalizeEvent, SimplePool, type EventTemplate, type NostrEvent } from "nostr-tools";
import { fetchSnippet, parsePermalink, type PermalinkData } from "./parsePermalink.js";

type HexString = Uint8Array<ArrayBufferLike>;

export async function createEventFromPermalink(
	permalink: string,
	sk: HexString,
	relays: string[]
): Promise<NostrEvent> {
	const linkData = parsePermalink(permalink);
	const eventTemplate = await createEvent(linkData!, relays);
	return finalizeEvent(eventTemplate, sk);
}

export async function createEvent(
	eventData: PermalinkData,
	relays: string[]
): Promise<EventTemplate> {

	const content = await fetchSnippet(eventData);

	const eventTemplate = {
		kind: 1623,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			[
				"repo",
				`https://${eventData.host}/${eventData.owner}/${eventData.repo}.git`
			],
			[
				"branch",
				eventData.branch
			],
			[
				"file",
				eventData.filePath
			],
		],
		content: content
	};

	if (eventData.endLine) {
		eventTemplate.tags.push([
			"lines",
			`${eventData.startLine}`,
			`${eventData.endLine}`
		]);
	} else {
		eventTemplate.tags.push([
			"lines",
			`${eventData.startLine}`
		]);
	}

	const r : string[] = relays.length > 0 ? relays : ['wss://relay.damus.io'];
	if (eventData?.repo) {
		const repoEvent = await fetchRepoEvent(eventData, r);
		if (repoEvent) {
			console.log(repoEvent);
			const repoId = repoEvent?.tags.find((t) => t[0] === 'd');
			eventTemplate.tags.push(
				['a', `30617:${repoEvent?.pubkey}:${repoId![1]}`]
			);
		}
	}

	return eventTemplate;
}

function fetchRepoEvent(
	linkData: PermalinkData,
	relays: string[]
): Promise<NostrEvent | undefined> {
	return new Promise((resolve) => {
		const pool = new SimplePool();
		const repoEvents: NostrEvent[] = [];

		// Subscribe
		const subHandle = pool.subscribeMany(
			relays,
			[
				{
					kinds: [30617],
					'#d': [linkData.repo],
				},
			],
			{
				onevent(event: NostrEvent) {
					repoEvents.push(event);
				},
				oneose() {
					subHandle.close();

					repoEvents.forEach((e) => console.log('DEBUG event:', e));

					const found = repoEvents.find((e) =>
						e.tags.some(
							(t) =>
								t[0] === 'clone' &&
								t[1].includes(`${linkData.owner}/${linkData.repo}`)
						)
					);
					resolve(found);
				},
			}
		);
	});
}
