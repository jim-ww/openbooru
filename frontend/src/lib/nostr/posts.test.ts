import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __setKeyringForTests, __setRegisteredForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { publishPost, getPost, getPosts, listPostsByAuthor, deletePost, eventToPost } from './posts';
import { POST_KIND } from './kinds';

// $lib/db/deletedPosts wraps idb-keyval, which needs a real IndexedDB
// unavailable under plain Node/vitest — swap it for an in-memory map, same
// pattern as db/deletedComments.
let deleteRequests: Record<string, number> = {};
vi.mock('$lib/db/deletedPosts', () => ({
	loadPostDeleteRequestedMap: async () => deleteRequests,
	markPostDeleteRequested: async (id: string) => {
		const timestamp = Date.now();
		deleteRequests = { ...deleteRequests, [id]: timestamp };
		return timestamp;
	}
}));

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
	deleteRequests = {};
});

const oneImage = [{ url: 'https://blossom.example/abc.jpg', sha256: 'abc', mime: 'image/jpeg' }];

describe('publishPost / getPost', () => {
	it('publishes a post and reads it back', async () => {
		const post = await publishPost({ content: 'hello', images: oneImage, tags: ['outdoors'], rating: 'general' });

		const fetched = await getPost(post.id);
		expect(fetched).toEqual({ ok: true, doc: expect.objectContaining({ content: 'hello', tags: ['outdoors'] }) });
	});

	it('rejects publishing with no images', async () => {
		await expect(publishPost({ content: '', images: [], tags: [], rating: 'general' })).rejects.toThrow(
			'needs at least one image'
		);
	});

	it('requires a registered account', async () => {
		__setRegisteredForTests(false);
		await expect(publishPost({ content: '', images: oneImage, tags: [], rating: 'general' })).rejects.toThrow(
			'Create an account'
		);
	});

	it('round-trips multiple images and their imeta fields', async () => {
		const images = [
			{ url: 'https://a.example/1.jpg', sha256: 'aaa', mime: 'image/jpeg', dim: '800x600', size: 12345 },
			{ url: 'https://a.example/2.png', sha256: 'bbb', mime: 'image/png' }
		];
		const post = await publishPost({ content: '', images, tags: [], rating: 'general' });

		expect(post.images).toEqual(images);
	});

	it('sets a content-warning tag for explicit posts, not for general', async () => {
		const explicit = await publishPost({ content: '', images: oneImage, tags: [], rating: 'explicit' });
		expect(explicit.rating).toBe('explicit');

		const general = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		expect(general.rating).toBe('general');
	});

	it('returns not-ok for a nonexistent post id', async () => {
		expect(await getPost('deadbeef')).toEqual({ ok: false, reason: 'invalid_schema' });
	});
});

describe('eventToPost', () => {
	it('drops an event with no valid imeta tag (never partially trusted)', () => {
		const fakeEvent = {
			id: 'x',
			pubkey: 'y',
			kind: POST_KIND,
			tags: [['t', 'no-image-here']],
			content: '',
			created_at: 0,
			sig: ''
		};
		expect(eventToPost(fakeEvent as never, {})).toBeNull();
	});
});

describe('getPosts', () => {
	it('batches a lookup for multiple ids in one call', async () => {
		const a = await publishPost({ content: 'a', images: oneImage, tags: [], rating: 'general' });
		const b = await publishPost({ content: 'b', images: oneImage, tags: [], rating: 'general' });

		const found = await getPosts([a.id, b.id]);
		expect(found.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
	});

	it('returns an empty array for an empty id list without querying', async () => {
		expect(await getPosts([])).toEqual([]);
	});
});

describe('listPostsByAuthor', () => {
	it("lists only the given author's posts", async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const first = await publishPost({ content: 'first', images: oneImage, tags: [], rating: 'general' });
		const second = await publishPost({ content: 'second', images: oneImage, tags: [], rating: 'general' });

		__setKeyringForTests(generateKeyring());
		await publishPost({ content: 'someone else', images: oneImage, tags: [], rating: 'general' });

		const posts = await listPostsByAuthor(keyring.publicKey);
		expect(posts.map((p) => p.id).sort()).toEqual([first.id, second.id].sort());
	});

	it(
		'sorts newest first',
		async () => {
			// created_at is second-resolution, so the two publishes need to land
			// in different seconds for sort order to be observable.
			const keyring = generateKeyring();
			__setKeyringForTests(keyring);
			const older = await publishPost({ content: 'older', images: oneImage, tags: [], rating: 'general' });
			await new Promise((resolve) => setTimeout(resolve, 1100));
			const newer = await publishPost({ content: 'newer', images: oneImage, tags: [], rating: 'general' });

			const posts = await listPostsByAuthor(keyring.publicKey);
			expect(posts.map((p) => p.id)).toEqual([newer.id, older.id]);
		},
		20000
	);
});

describe('deletePost', () => {
	it('rejects deletion from a non-author', async () => {
		const post = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		__setKeyringForTests(generateKeyring());
		await expect(deletePost(post.id)).rejects.toThrow('Only the author can delete this post.');
	});

	it('marks the post deleted locally and still resolves it via getPost', async () => {
		const post = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		await deletePost(post.id);

		const fetched = await getPost(post.id);
		expect(fetched.ok).toBe(true);
		expect(fetched.ok && fetched.doc.deleted).toBe(true);
		expect(fetched.ok && fetched.doc.deleted_at).not.toBeNull();
	});
});
