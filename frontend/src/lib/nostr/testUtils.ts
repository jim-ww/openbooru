import type { SimplePool } from 'nostr-tools/pool';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { matchFilter } from 'nostr-tools';

/** Replaceable/addressable-event identity key (kind+pubkey[+d]) per NIP-01/
 *  NIP-33 — real relays only retain the latest event per key, which this
 *  fake pool mimics so tests don't have to worry about `created_at` ties
 *  between revisions published within the same wall-clock second. */
function replaceableKey(event: NostrEvent): string | null {
	if (event.kind === 0 || (event.kind >= 10000 && event.kind < 20000)) {
		return `${event.kind}:${event.pubkey}`;
	}
	if (event.kind >= 30000 && event.kind < 40000) {
		const d = event.tags.find((t) => t[0] === 'd')?.[1] ?? '';
		return `${event.kind}:${event.pubkey}:${d}`;
	}
	return null;
}

/** A minimal in-memory fake relay pool exercising only the SimplePool surface
 *  nostr/event.ts actually calls (`ensureRelay`/`publish`/`querySync`/
 *  `subscribeMany`), so tests don't depend on real relay connectivity. Each
 *  relay URL gets its own isolated event store — mirroring how two real
 *  relays can genuinely disagree about what they've seen (e.g. a relay
 *  switch mid-session) — rather than one shared bucket. */
export function createFakePool() {
	const byRelay = new Map<string, NostrEvent[]>();
	const subscribers = new Map<string, Set<(event: NostrEvent) => void>>();

	function storeFor(relay: string): NostrEvent[] {
		let store = byRelay.get(relay);
		if (!store) {
			store = [];
			byRelay.set(relay, store);
		}
		return store;
	}

	const pool = {
		ensureRelay: async (relay: string) => ({
			count: async (filters: Filter[]) => storeFor(relay).filter((e) => filters.some((f) => matchFilter(f, e))).length
		}),
		publish(relays: string[], event: NostrEvent) {
			for (const relay of relays) {
				const store = storeFor(relay);
				const key = replaceableKey(event);
				if (key) {
					const idx = store.findIndex((e) => replaceableKey(e) === key);
					if (idx >= 0) {
						if (event.created_at >= store[idx].created_at) store[idx] = event;
					} else {
						store.push(event);
					}
				} else {
					store.push(event);
				}
				for (const handler of subscribers.get(relay) ?? []) handler(event);
			}
			return relays.map(() => Promise.resolve('ok'));
		},
		querySync(relays: string[], filter: Filter) {
			const seen = new Set<string>();
			const results: NostrEvent[] = [];
			for (const relay of relays) {
				for (const event of storeFor(relay).filter((e) => matchFilter(filter, e))) {
					if (!seen.has(event.id)) {
						seen.add(event.id);
						results.push(event);
					}
				}
			}
			return Promise.resolve(results);
		},
		subscribeMany(
			relays: string[],
			filter: Filter,
			params: { onevent: (e: NostrEvent) => void; oneose?: () => void }
		) {
			// Real relays reply to a REQ with every already-stored event
			// matching the filter, then EOSE — deduped across relays like
			// querySync above, since nostr/event.ts:streamEvents relies on
			// that same semantics (and on oneose actually firing) to resolve.
			const seen = new Set<string>();
			for (const relay of relays) {
				for (const event of storeFor(relay).filter((e) => matchFilter(filter, e))) {
					if (!seen.has(event.id)) {
						seen.add(event.id);
						params.onevent(event);
					}
				}
			}
			params.oneose?.();
			for (const relay of relays) {
				if (!subscribers.has(relay)) subscribers.set(relay, new Set());
				subscribers.get(relay)!.add(params.onevent);
			}
			return {
				close: () => {
					for (const relay of relays) subscribers.get(relay)?.delete(params.onevent);
				}
			};
		}
	} as unknown as SimplePool;

	return { pool, byRelay };
}
