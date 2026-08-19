import { describe, it, expect, afterEach } from 'vitest';
import type { SimplePool } from 'nostr-tools/pool';
import type { Event as NostrEvent } from 'nostr-tools';
import { generateKeyring } from './keys';
import { publishEvent, queryEvents, subscribeEvents } from './event';
import { __setPoolForTests } from './pool';

/** A minimal fake pool exercising only the surface nostr/event.ts actually
 *  calls, so these tests don't depend on real relay connectivity. */
function fakePool(events: NostrEvent[]) {
	const stored = [...events];
	let subscribedHandler: ((event: NostrEvent) => void) | null = null;
	return {
		pool: {
			ensureRelay: async () => ({}),
			publish(_relays: string[], event: NostrEvent) {
				stored.push(event);
				return [Promise.resolve('ok')];
			},
			querySync(_relays: string[], filter: { kinds?: number[]; authors?: string[] }) {
				return Promise.resolve(
					stored.filter(
						(e) =>
							(!filter.kinds || filter.kinds.includes(e.kind)) &&
							(!filter.authors || filter.authors.includes(e.pubkey))
					)
				);
			},
			subscribeMany(_relays: string[], _filter: unknown, params: { onevent: (e: NostrEvent) => void }) {
				subscribedHandler = params.onevent;
				return { close: () => {} };
			}
		} as unknown as SimplePool,
		emit(event: NostrEvent) {
			subscribedHandler?.(event);
		},
		stored
	};
}

afterEach(() => {
	__setPoolForTests(null);
});

describe('publishEvent / queryEvents', () => {
	it('publishes a signed event and finds it via a matching filter', async () => {
		const keyring = generateKeyring();
		const { pool } = fakePool([]);
		__setPoolForTests(pool);

		const published = await publishEvent({ kind: 1, tags: [], content: 'hi', created_at: 0 }, keyring, ['wss://fake']);
		expect(published.pubkey).toBe(keyring.publicKey);

		const found = await queryEvents({ kinds: [1], authors: [keyring.publicKey] }, ['wss://fake']);
		expect(found).toHaveLength(1);
		expect(found[0].id).toBe(published.id);
	});

	it('drops events that fail signature verification', async () => {
		const keyring = generateKeyring();
		const signed = await publishEvent({ kind: 1, tags: [], content: 'x', created_at: 0 }, keyring, []);
		// Round-trip through JSON first — nostr-tools caches its verify result
		// on a symbol property that a plain object spread would otherwise carry
		// over from the original (see sign.test.ts).
		const tampered = { ...JSON.parse(JSON.stringify(signed)), content: 'tampered' };
		const { pool } = fakePool([tampered as NostrEvent]);
		__setPoolForTests(pool);

		const found = await queryEvents({ kinds: [1] }, ['wss://fake']);
		expect(found).toEqual([]);
	});
});

describe('subscribeEvents', () => {
	it('delivers events pushed after subscribing', async () => {
		const keyring = generateKeyring();
		const { pool, emit } = fakePool([]);
		__setPoolForTests(pool);

		const received: NostrEvent[] = [];
		const unsubscribe = subscribeEvents({ kinds: [1] }, ['wss://fake'], (e) => received.push(e));

		const event = await publishEvent({ kind: 1, tags: [], content: 'pushed', created_at: 0 }, keyring, []);
		emit(event);

		expect(received).toHaveLength(1);
		expect(received[0].id).toBe(event.id);
		unsubscribe();
	});
});
