import { beforeEach, describe, expect, it, vi } from 'vitest';

// idb-keyval needs a real IndexedDB that isn't available under plain
// Node/vitest — swap it for an in-memory map.
let idbStore = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
	get: async (key: string) => idbStore.get(key),
	set: async (key: string, value: unknown) => {
		idbStore.set(key, value);
	},
	del: async (key: string) => {
		idbStore.delete(key);
	},
	// Real transactional (all-or-nothing) semantics aren't exercised here —
	// this fake only needs to apply every put/delete so dataEncryption.ts's
	// atomicWrite() has something to call.
	createStore: () => (_mode: string, callback: (store: unknown) => unknown) => {
		const puts: [unknown, unknown][] = [];
		const deletes: unknown[] = [];
		const fakeStore = {
			put: (value: unknown, key: unknown) => puts.push([key, value]),
			delete: (key: unknown) => deletes.push(key),
			transaction: Promise.resolve()
		};
		return Promise.resolve(callback(fakeStore)).then(() => {
			for (const [key, value] of puts) idbStore.set(key as string, value);
			for (const key of deletes) idbStore.delete(key as string);
		});
	},
	promisifyRequest: (p: unknown) => p
}));

const STORE_KEY = 'openbooru:preferences';

describe('dataEncryption', () => {
	beforeEach(() => {
		idbStore = new Map();
		vi.resetModules();
	});

	it('passes values through as plaintext when encryption was never enabled', async () => {
		const enc = await import('./dataEncryption');
		await enc.set(STORE_KEY, { hello: 'world' });
		expect(idbStore.get(STORE_KEY)).toEqual({ hello: 'world' });
		expect(await enc.get(STORE_KEY)).toEqual({ hello: 'world' });
	});

	it('enabling encryption re-encrypts existing plaintext data in place', async () => {
		const enc = await import('./dataEncryption');
		await enc.set(STORE_KEY, { hello: 'world' });

		await enc.enableEncryption('correct horse battery staple');

		expect(await enc.isEncryptionEnabled()).toBe(true);
		expect(await enc.get(STORE_KEY)).toEqual({ hello: 'world' });
		// The raw stored value is no longer the plaintext object.
		expect(idbStore.get(STORE_KEY)).not.toEqual({ hello: 'world' });
	});

	it('round-trips a payload too large for a naive spread-based base64 encode', async () => {
		// Regression guard for String.fromCharCode(...bytes) blowing the
		// call-stack argument limit on a large payload (way more than
		// TO_B64_CHUNK_SIZE's 32768 bytes once encrypted).
		const big = { text: 'x'.repeat(500_000) };
		const enc = await import('./dataEncryption');
		await enc.set(STORE_KEY, big);
		await enc.enableEncryption('correct horse battery staple');
		expect(await enc.get(STORE_KEY)).toEqual(big);
	});

	it('unlock fails with the wrong passphrase and succeeds with the right one', async () => {
		const enc = await import('./dataEncryption');
		await enc.enableEncryption('correct horse battery staple');
		enc.lock();

		await expect(enc.unlock('wrong passphrase')).rejects.toThrow();
		expect(enc.isUnlocked()).toBe(false);

		await enc.unlock('correct horse battery staple');
		expect(enc.isUnlocked()).toBe(true);
	});

	it('get()/set() throw while locked', async () => {
		const enc = await import('./dataEncryption');
		await enc.set(STORE_KEY, { hello: 'world' });
		await enc.enableEncryption('correct horse battery staple');
		enc.lock();

		await expect(enc.get(STORE_KEY)).rejects.toThrow();
		await expect(enc.set(STORE_KEY, { other: 1 })).rejects.toThrow();
	});

	it('disableEncryption verifies the passphrase and restores plaintext', async () => {
		const enc = await import('./dataEncryption');
		await enc.set(STORE_KEY, { hello: 'world' });
		await enc.enableEncryption('correct horse battery staple');

		await expect(enc.disableEncryption('wrong passphrase')).rejects.toThrow();
		expect(await enc.isEncryptionEnabled()).toBe(true);

		await enc.disableEncryption('correct horse battery staple');
		expect(await enc.isEncryptionEnabled()).toBe(false);
		expect(idbStore.get(STORE_KEY)).toEqual({ hello: 'world' });
	});

	it('changePassphrase rotates the wrap without touching the underlying data', async () => {
		const enc = await import('./dataEncryption');
		await enc.set(STORE_KEY, { hello: 'world' });
		await enc.enableEncryption('old passphrase');

		await enc.changePassphrase('old passphrase', 'new passphrase');
		enc.lock();

		await expect(enc.unlock('old passphrase')).rejects.toThrow();
		await enc.unlock('new passphrase');
		expect(await enc.get(STORE_KEY)).toEqual({ hello: 'world' });
	});
});
