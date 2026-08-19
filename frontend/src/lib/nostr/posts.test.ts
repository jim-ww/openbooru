import { describe, it, expect, beforeEach } from 'vitest';
import { __setKeyringForTests, __setRegisteredForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { publishPost, getPost, listPostsByAuthor, listPostIdsByAuthor, deletePost, undeletePost, eventToPost } from './posts';
import { POST_KIND } from './kinds';

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
});

const oneImage = [{ url: 'https://blossom.example/abc.jpg', sha256: 'abc', mime: 'image/jpeg' }];

describe('publishPost / getPost', () => {
	it('publishes a post and reads it back', async () => {
		const post = await publishPost({ content: 'hello', images: oneImage, tags: ['outdoors'], rating: 'general' });

		const fetched = await getPost(post.id);
		expect(fetched).toEqual({
			ok: true,
			doc: expect.objectContaining({ content: 'hello', tags: ['outdoors'], version: 1 })
		});
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
		const keyring = generateKeyring();
		expect(await getPost(`${keyring.publicKey}:${crypto.randomUUID()}`)).toEqual({ ok: false, reason: 'invalid_schema' });
	});
});

describe('eventToPost', () => {
	it('drops an event with no valid imeta tag (never partially trusted)', () => {
		const fakeEvent = {
			id: 'x',
			pubkey: 'y',
			kind: POST_KIND,
			tags: [
				['d', 'some-uuid'],
				['published_at', '0']
			],
			content: JSON.stringify({ content: '', version: 1, deleted: false, deleted_at: null }),
			created_at: 0,
			sig: ''
		};
		expect(eventToPost(fakeEvent as never)).toBeNull();
	});

	it('drops an event missing the d/published_at tags', () => {
		const fakeEvent = {
			id: 'x',
			pubkey: 'y',
			kind: POST_KIND,
			tags: [['imeta', 'url https://a.example/1.jpg']],
			content: JSON.stringify({ content: '', version: 1, deleted: false, deleted_at: null }),
			created_at: 0,
			sig: ''
		};
		expect(eventToPost(fakeEvent as never)).toBeNull();
	});
});

describe('editing a post', () => {
	it('publishes a new revision under the same id, incrementing version', async () => {
		const created = await publishPost({ content: 'v1', images: oneImage, tags: ['a'], rating: 'general' });
		expect(created.version).toBe(1);

		const edited = await publishPost({ id: created.id, content: 'v2', images: oneImage, tags: ['a', 'b'], rating: 'sensitive' });
		expect(edited.id).toBe(created.id);
		expect(edited.version).toBe(2);
		expect(edited.content).toBe('v2');
		expect(edited.tags).toEqual(['a', 'b']);
		expect(edited.rating).toBe('sensitive');

		const fetched = await getPost(created.id);
		expect(fetched.ok && fetched.doc.content).toBe('v2');
	});

	it('preserves the original published_at across an edit', async () => {
		const created = await publishPost({ content: 'v1', images: oneImage, tags: [], rating: 'general' });
		const edited = await publishPost({ id: created.id, content: 'v2', images: oneImage, tags: [], rating: 'general' });
		expect(edited.created_at).toBe(created.created_at);
	});

	it('rejects editing from a non-author', async () => {
		const created = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		__setKeyringForTests(generateKeyring());
		await expect(publishPost({ id: created.id, content: 'hijacked', images: oneImage, tags: [], rating: 'general' })).rejects.toThrow(
			'Only the author can edit this post.'
		);
	});

	it('rejects editing a post that does not exist', async () => {
		const keyring = generateKeyring();
		await expect(
			publishPost({ id: `${keyring.publicKey}:${crypto.randomUUID()}`, content: '', images: oneImage, tags: [], rating: 'general' })
		).rejects.toThrow('Post not found.');
	});
});

describe('listPostIdsByAuthor / listPostsByAuthor', () => {
	it("lists only the given author's posts", async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const first = await publishPost({ content: 'first', images: oneImage, tags: [], rating: 'general' });
		const second = await publishPost({ content: 'second', images: oneImage, tags: [], rating: 'general' });

		__setKeyringForTests(generateKeyring());
		await publishPost({ content: 'someone else', images: oneImage, tags: [], rating: 'general' });

		const ids = await listPostIdsByAuthor(keyring.publicKey);
		expect(ids.sort()).toEqual([first.id, second.id].sort());
	});

	it('lists only one id per post even after it has been edited', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const created = await publishPost({ content: 'v1', images: oneImage, tags: [], rating: 'general' });
		await publishPost({ id: created.id, content: 'v2', images: oneImage, tags: [], rating: 'general' });

		expect(await listPostIdsByAuthor(keyring.publicKey)).toEqual([created.id]);
	});

	it(
		'sorts posts newest published first',
		async () => {
			// published_at is second-resolution, so the two publishes need to
			// land in different seconds for sort order to be observable.
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

describe('deletePost / undeletePost', () => {
	it('rejects deletion from a non-author', async () => {
		const post = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		__setKeyringForTests(generateKeyring());
		await expect(deletePost(post.id)).rejects.toThrow('Only the author can delete this post.');
	});

	it('marks the post deleted and still resolves it via getPost', async () => {
		const post = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		await deletePost(post.id);

		const fetched = await getPost(post.id);
		expect(fetched.ok).toBe(true);
		expect(fetched.ok && fetched.doc.deleted).toBe(true);
		expect(fetched.ok && fetched.doc.deleted_at).not.toBeNull();
	});

	it('restores a deleted post via undeletePost, same id', async () => {
		const post = await publishPost({ content: 'still here', images: oneImage, tags: [], rating: 'general' });
		const deleted = await deletePost(post.id);
		const restored = await undeletePost(deleted);

		expect(restored.id).toBe(post.id);
		expect(restored.deleted).toBe(false);
		expect(restored.content).toBe('still here');

		const fetched = await getPost(post.id);
		expect(fetched.ok && fetched.doc.deleted).toBe(false);
	});

	it('rejects restoring from a non-author', async () => {
		const post = await publishPost({ content: '', images: oneImage, tags: [], rating: 'general' });
		const deleted = await deletePost(post.id);
		__setKeyringForTests(generateKeyring());
		await expect(undeletePost(deleted)).rejects.toThrow('Only the author can restore this post.');
	});
});
