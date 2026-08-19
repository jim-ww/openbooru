import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { Keyring, PubKey } from '$lib/types';
import { publishEvent, queryEvents } from './event';
import { RELAY_LIST_KIND } from './kinds';
import { getCachedRelayList, setCachedRelayList } from './pool';
import { getActiveRelays } from '$lib/state/preferences.svelte';

export interface RelayList {
	read: string[];
	write: string[];
}

const EMPTY_RELAY_LIST: RelayList = { read: [], write: [] };

function eventToRelayList(event: Pick<NostrEvent, 'tags'>): RelayList {
	const read: string[] = [];
	const write: string[] = [];
	for (const tag of event.tags) {
		if (tag[0] !== 'r' || !tag[1]) continue;
		const marker = tag[2];
		if (marker === 'read') read.push(tag[1]);
		else if (marker === 'write') write.push(tag[1]);
		else {
			read.push(tag[1]);
			write.push(tag[1]);
		}
	}
	return { read, write };
}

/** Resolves `pubkey`'s own declared NIP-65 relay list (kind 10002), querying
 *  the user's configured relay set (see getActiveRelays) — a bootstrap
 *  problem inherent to the outbox model: you need *some* relay to discover
 *  where to look for someone's own relays in the first place. Cached
 *  in-memory per pubkey for the session (see pool.ts), since a relay list
 *  rarely changes and paying a network round-trip for every single
 *  author-scoped lookup would defeat the point of caching it at all. */
export async function getRelayList(pubkey: PubKey): Promise<RelayList> {
	const cached = getCachedRelayList(pubkey);
	if (cached) return cached;

	const events = await queryEvents({ kinds: [RELAY_LIST_KIND], authors: [pubkey] }, getActiveRelays());
	const relayList =
		events.length > 0 ? eventToRelayList(events.reduce((a, b) => (b.created_at > a.created_at ? b : a))) : EMPTY_RELAY_LIST;
	setCachedRelayList(pubkey, relayList);
	return relayList;
}

/** Relays to query when looking up something `pubkey` published — the union
 *  of the user's own configured relays and `pubkey`'s declared write relays
 *  (the "outbox": where they said they publish to, per NIP-65's inversion of
 *  "read from where you'd naively look" into "read from where the author
 *  said they publish"). */
export async function readRelaysFor(pubkey: PubKey): Promise<string[]> {
	const { write } = await getRelayList(pubkey);
	return Array.from(new Set([...getActiveRelays(), ...write]));
}

/** Relays to publish `keyring`'s own content to — the union of the user's own
 *  configured relays and their own declared write relays, so a peer
 *  following their NIP-65 hints can find it. */
export async function writeRelaysFor(keyring: Keyring): Promise<string[]> {
	const { write } = await getRelayList(keyring.publicKey);
	return Array.from(new Set([...getActiveRelays(), ...write]));
}

/** Publishes the current user's own NIP-65 relay list. */
export async function publishRelayList(
	relays: { url: string; read: boolean; write: boolean }[],
	keyring: Keyring
): Promise<void> {
	const tags: string[][] = relays
		.filter((r) => r.read || r.write)
		.map(({ url, read, write }) => {
			if (read && write) return ['r', url];
			if (read) return ['r', url, 'read'];
			return ['r', url, 'write'];
		});
	const template: EventTemplate = {
		kind: RELAY_LIST_KIND,
		tags,
		content: '',
		created_at: Math.floor(Date.now() / 1000)
	};
	const event = await publishEvent(template, keyring, getActiveRelays());
	setCachedRelayList(keyring.publicKey, eventToRelayList(event));
}
