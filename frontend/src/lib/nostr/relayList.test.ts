import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { DEFAULT_NOSTR_RELAYS } from './relays';
import { publishRelayList, getRelayList, readRelaysFor, writeRelaysFor } from './relayList';

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
});

describe('publishRelayList / getRelayList', () => {
	it('round-trips read/write relay markers', async () => {
		const keyring = generateKeyring();
		await publishRelayList(
			[
				{ url: 'wss://both.example', read: true, write: true },
				{ url: 'wss://read-only.example', read: true, write: false },
				{ url: 'wss://write-only.example', read: false, write: true }
			],
			keyring
		);

		const list = await getRelayList(keyring.publicKey);
		expect(list.read.sort()).toEqual(['wss://both.example', 'wss://read-only.example'].sort());
		expect(list.write.sort()).toEqual(['wss://both.example', 'wss://write-only.example'].sort());
	});

	it('returns empty lists for an author with no published relay list', async () => {
		const keyring = generateKeyring();
		expect(await getRelayList(keyring.publicKey)).toEqual({ read: [], write: [] });
	});
});

describe('readRelaysFor / writeRelaysFor', () => {
	it("unions the default relay set with the author's declared write relays", async () => {
		const keyring = generateKeyring();
		await publishRelayList([{ url: 'wss://custom.example', read: true, write: true }], keyring);

		const relays = await readRelaysFor(keyring.publicKey);
		expect(relays).toEqual(expect.arrayContaining([...DEFAULT_NOSTR_RELAYS, 'wss://custom.example']));

		const writeRelays = await writeRelaysFor(keyring);
		expect(writeRelays).toEqual(relays);
	});

	it('falls back to just the default relays when nothing is published', async () => {
		const keyring = generateKeyring();
		expect(await readRelaysFor(keyring.publicKey)).toEqual(DEFAULT_NOSTR_RELAYS);
	});
});
