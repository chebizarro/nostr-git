import { finalizeEvent, SimplePool, type EventTemplate, type NostrEvent } from "nostr-tools";
import { fetchSnippet, parsePermalink, type PermalinkData } from "./parsePermalink.js";

type HexString = Uint8Array<ArrayBufferLike>;

export async function createEventFromPermalink(permalink: string, sk: HexString) {

	const linkData = parsePermalink(permalink);

	const eventTemplate = await createEvent(linkData!);

	const relays: string[] = ['wss://relay.damus.io'];
	if (linkData?.repo) {
		const repoEvent = fetchRepoEvent(linkData, relays);
		if (repoEvent) {
			const repoId = repoEvent?.tags.find(((t) => t[0] === 'd'));
			eventTemplate.tags.push(['a', `30617:${repoEvent?.pubkey}:${repoId}`])
		}
	}

	//const event = finalizeEvent(eventTemplate, sk);
	console.log(eventTemplate);
}

export async function createEvent(eventData: PermalinkData): Promise<EventTemplate> {

	const content = await fetchSnippet(eventData);

	const eventTemplate = {
		kind: 1623,
		created_at: Math.floor(Date.now() / 1000),
		tags: [
			["repo", `https://${eventData.host}/${eventData.owner}/${eventData.repo}.git`],
			["branch", eventData.branch],
			["file", eventData.filePath],
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

	return eventTemplate;
}


function fetchRepoEvent(linkData: PermalinkData, relays: string[]): (NostrEvent | undefined) {

	const pool = new SimplePool()
	const repoEvents: NostrEvent[] = []

	const h = pool.subscribeMany(
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
				h.close()
			}
		}
	)

	console.log(repoEvents);

	return repoEvents.find((e) =>
		e.tags.find((t) =>
			t[0] === 'clone' &&
			t[1].includes(`${linkData.owner}/${linkData.repo}`)
		)
	);
}