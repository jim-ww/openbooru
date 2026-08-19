import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { __setPreferencesForTests } from '$lib/state/preferences.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { deletePost, publishPost } from './posts';
import { browseByTag, browseNetworkPage, searchByTags, browseByAuthor } from './browse';
import { publishProfile } from './profile';

// $lib/db/deletedPosts wraps idb-keyval, which needs a real IndexedDB
// unavailable under plain Node/vitest — swap it for an in-memory map.
let deleteRequests: Record<string, number> = {};
vi.mock('$lib/db/deletedPosts', () => ({
	loadPostDeleteRequestedMap: async () => deleteRequests,
	markPostDeleteRequested: async (id: string) => {
		const timestamp = Date.now();
		deleteRequests = { ...deleteRequests, [id]: timestamp };
		return timestamp;
	}
}));

const oneImage = [{ url: 'https://blossom.example/abc.jpg' }];

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
	deleteRequests = {};
});

async function post(tags: string[], rating: 'general' | 'sensitive' | 'explicit' = 'general') {
	// content is unique per call — a NIP-01 event id hashes
	// [pubkey, created_at, kind, tags, content], and calls made back-to-back
	// (e.g. inside Promise.all) can land in the same second, so identical
	// content+tags would produce colliding ids for what should be distinct
	// posts.
	return publishPost({ content: crypto.randomUUID(), images: oneImage, tags, rating });
}

describe('browseByTag', () => {
	it('finds published posts carrying the tag', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await post([tag]);

		const results = await browseByTag(tag);
		expect(results.map((p) => p.id)).toContain(created.id);
	});

	it('excludes tombstoned posts', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await post([tag]);
		await deletePost(created.id);

		const results = await browseByTag(tag);
		expect(results.map((p) => p.id)).not.toContain(created.id);
	});

	it('returns nothing for an unused tag', async () => {
		expect(await browseByTag(`unused-${crypto.randomUUID()}`)).toEqual([]);
	});
});

describe('searchByTags', () => {
	it('requires every tag to be present (AND), not just any one of them', async () => {
		const a = `a-${crypto.randomUUID()}`;
		const b = `b-${crypto.randomUUID()}`;
		const both = await post([a, b]);
		await post([a]); // only tag a, should not match
		await post([b]); // only tag b, should not match

		const results = await searchByTags([a, b]);
		expect(results.map((p) => p.id)).toEqual([both.id]);
	});

	it('returns an empty array for an empty tag list', async () => {
		expect(await searchByTags([])).toEqual([]);
	});
});

describe('browseNetworkPage', () => {
	it('pages through results and eventually returns a null cursor', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await Promise.all([0, 1, 2].map(() => post([tag])));

		const seen: string[] = [];
		let cursor = null;
		let guard = 0;
		do {
			const page = await browseNetworkPage(cursor, 1);
			expect(page.posts.length).toBeLessThanOrEqual(1);
			seen.push(...page.posts.map((p) => p.id));
			cursor = page.cursor;
			guard += 1;
		} while (cursor !== null && guard < 100);

		for (const c of created) expect(seen).toContain(c.id);
	});

	it('excludes tombstoned posts', async () => {
		const created = await post([]);
		await deletePost(created.id);

		const { posts } = await browseNetworkPage(null, 1000);
		expect(posts.map((p) => p.id)).not.toContain(created.id);
	});
});

describe('rating visibility', () => {
	afterEach(() => {
		__setPreferencesForTests({ visibleRatings: ['general', 'sensitive'] });
	});

	it('hides explicit posts by default', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await post([tag], 'explicit');

		expect((await browseByTag(tag)).map((p) => p.id)).not.toContain(created.id);
	});

	it('shows explicit posts once opted in', async () => {
		const tag = `t-${crypto.randomUUID()}`;
		const created = await post([tag], 'explicit');
		__setPreferencesForTests({ visibleRatings: ['general', 'sensitive', 'explicit'] });

		expect((await browseByTag(tag)).map((p) => p.id)).toContain(created.id);
	});
});

describe('author blocklist', () => {
	afterEach(() => {
		__setPreferencesForTests({ blockedAuthors: [] });
	});

	it('excludes posts from a locally-blocked author', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const tag = `t-${crypto.randomUUID()}`;
		const created = await post([tag]);

		__setPreferencesForTests({ blockedAuthors: [keyring.publicKey] });
		expect((await browseByTag(tag)).map((p) => p.id)).not.toContain(created.id);

		__setPreferencesForTests({ blockedAuthors: [] });
		expect((await browseByTag(tag)).map((p) => p.id)).toContain(created.id);
	});
});

describe('browseByAuthor', () => {
	it('finds posts authored by a raw pubkey', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const created = await post([]);

		const results = await browseByAuthor(keyring.publicKey);
		expect(results.map((p) => p.id)).toEqual([created.id]);
	});

	it('resolves a claimed username to its author', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const username = `author-${crypto.randomUUID().slice(0, 8)}`;
		await publishProfile({ username, description: '' });
		const created = await post([]);

		const results = await browseByAuthor(username);
		expect(results.map((p) => p.id)).toEqual([created.id]);
	});

	it('decodes an npub1... identifier to the same author as its raw hex pubkey', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const created = await post([]);

		const { nip19 } = await import('nostr-tools');
		const results = await browseByAuthor(nip19.npubEncode(keyring.publicKey));
		expect(results.map((p) => p.id)).toEqual([created.id]);
	});
});
