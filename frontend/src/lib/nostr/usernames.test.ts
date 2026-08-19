import { describe, it, expect, beforeEach } from 'vitest';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { claimUsername, releaseUsername, getUsernameClaim, resolveAuthorIdentifier } from './usernames';

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
});

describe('claimUsername / getUsernameClaim', () => {
	it('claims an unclaimed username', async () => {
		const keyring = generateKeyring();
		const name = `Aria-${crypto.randomUUID()}`;

		await claimUsername(name, keyring);

		const claim = await getUsernameClaim(name);
		expect(claim).toEqual({
			ok: true,
			doc: expect.objectContaining({ authorPub: keyring.publicKey, deleted: false })
		});
	});

	it('rejects claiming a username someone else already holds', async () => {
		const owner = generateKeyring();
		const other = generateKeyring();
		const name = `Bob-${crypto.randomUUID()}`;

		await claimUsername(name, owner);

		await expect(claimUsername(name, other)).rejects.toThrow('already taken');
	});

	it('is idempotent for the original claimant, preserving claimed_at', async () => {
		const keyring = generateKeyring();
		const name = `Cara-${crypto.randomUUID()}`;

		await claimUsername(name, keyring);
		const first = await getUsernameClaim(name);
		await claimUsername(name, keyring);
		const second = await getUsernameClaim(name);

		expect(first.ok && second.ok && first.doc.claimed_at).toBe(second.ok && second.doc.claimed_at);
	});

	it('rejects an empty username', async () => {
		const keyring = generateKeyring();
		await expect(claimUsername('   ', keyring)).rejects.toThrow('cannot be empty');
	});

	it('is case/whitespace-insensitive', async () => {
		const owner = generateKeyring();
		const other = generateKeyring();
		const base = `Dana${crypto.randomUUID().slice(0, 8)}`;

		await claimUsername(base.toLowerCase(), owner);
		await expect(claimUsername(`  ${base.toUpperCase()}  `, other)).rejects.toThrow('already taken');
	});
});

describe('releaseUsername', () => {
	it('frees a claim for the next claimant', async () => {
		const owner = generateKeyring();
		const newOwner = generateKeyring();
		const name = `Eve-${crypto.randomUUID()}`;

		await claimUsername(name, owner);
		await releaseUsername(name, owner);

		await expect(claimUsername(name, newOwner)).resolves.toBeUndefined();
	});

	it('does nothing if the caller does not hold the claim', async () => {
		const owner = generateKeyring();
		const attacker = generateKeyring();
		const name = `Frank-${crypto.randomUUID()}`;

		await claimUsername(name, owner);
		await releaseUsername(name, attacker);

		const claim = await getUsernameClaim(name);
		expect(claim.ok && !claim.doc.deleted && claim.doc.authorPub === owner.publicKey).toBe(true);
	});
});

describe('resolveAuthorIdentifier', () => {
	it('resolves a claimed username to its pubkey', async () => {
		const keyring = generateKeyring();
		const name = `Grace-${crypto.randomUUID()}`;
		await claimUsername(name, keyring);

		expect(await resolveAuthorIdentifier(`@${name}`)).toBe(keyring.publicKey);
	});

	it('passes through a raw hex pubkey unchanged', async () => {
		const keyring = generateKeyring();
		expect(await resolveAuthorIdentifier(keyring.publicKey)).toBe(keyring.publicKey);
	});

	it('decodes an npub1... identifier', async () => {
		const keyring = generateKeyring();
		const { nip19 } = await import('nostr-tools');
		expect(await resolveAuthorIdentifier(nip19.npubEncode(keyring.publicKey))).toBe(keyring.publicKey);
	});
});
