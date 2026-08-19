import { describe, it, expect, beforeEach, vi } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { __setPreferencesForTests } from '$lib/state/preferences.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { DEFAULT_NOSTR_RELAYS } from './relays';
import { publishRelayList } from './relayList';
import { publishPost } from './posts';
import { postComment, deleteComment, getComment, getCommentsForPost, getCommentsAuthoredBy } from './comments';
import { MAX_COMMENT_LENGTH } from '$lib/types';

// $lib/db/deletedComments wraps idb-keyval, which needs a real IndexedDB
// unavailable under plain Node/vitest — swap it for an in-memory map.
let deleteRequests: Record<string, number> = {};
vi.mock('$lib/db/deletedComments', () => ({
	loadDeleteRequestedMap: async () => deleteRequests,
	markCommentDeleteRequested: async (id: string) => {
		const timestamp = Date.now();
		deleteRequests = { ...deleteRequests, [id]: timestamp };
		return timestamp;
	}
}));

let mainKeyring: ReturnType<typeof generateKeyring>;

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	mainKeyring = generateKeyring();
	__setKeyringForTests(mainKeyring);
	__setPreferencesForTests({ nostrRelays: DEFAULT_NOSTR_RELAYS });
	deleteRequests = {};
});

const oneImage = [{ url: 'https://blossom.example/abc.jpg' }];

async function realPost() {
	// content must be unique per call — a NIP-01 event id hashes
	// [pubkey, created_at, kind, tags, content], and calls made
	// back-to-back can land in the same second, so identical content would
	// produce colliding ids for what should be distinct posts.
	return publishPost({ content: crypto.randomUUID(), images: oneImage, tags: [], rating: 'general' });
}

describe('postComment / getCommentsForPost', () => {
	it('posts a comment and finds it via a relay filter', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, 'Hello there');

		const comments = await getCommentsForPost(post.id);
		expect(comments).toHaveLength(1);
		expect(comments[0].id).toBe(comment.id);
		expect(comments[0].content).toBe('Hello there');
	});

	it('marks a deleted comment as deletion-requested rather than dropping it', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, 'Will be deleted');
		await deleteComment(comment.id);

		const comments = await getCommentsForPost(post.id);
		expect(comments).toHaveLength(1);
		expect(comments[0].deleted).toBe(true);
		expect(comments[0].deleted_at).not.toBeNull();
	});

	it("drops a comment event that doesn't actually match the requested post (never partially trusted)", async () => {
		const post = await realPost();
		const otherPost = await realPost();
		await postComment(otherPost.id, 'Belongs elsewhere');

		expect(await getCommentsForPost(post.id)).toEqual([]);
	});

	it('stays attached to the post across an edit (same coordinate)', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, 'Before the edit');

		await publishPost({ id: post.id, content: 'edited caption', images: oneImage, tags: ['new-tag'], rating: 'general' });

		const comments = await getCommentsForPost(post.id);
		expect(comments.map((c) => c.id)).toEqual([comment.id]);
	});

	it('posts a reply with parent_id set, alongside the top-level comment', async () => {
		const post = await realPost();
		const root = await postComment(post.id, 'Top-level');

		__setKeyringForTests(generateKeyring());
		const reply = await postComment(post.id, 'A reply', root.id);
		__setKeyringForTests(generateKeyring());

		expect(reply.parent_id).toBe(root.id);

		const comments = await getCommentsForPost(post.id);
		expect(comments).toHaveLength(2);
		expect(comments.find((c) => c.id === root.id)?.parent_id).toBeNull();
		expect(comments.find((c) => c.id === reply.id)?.parent_id).toBe(root.id);
	});

	it('rejects replying to your own comment', async () => {
		const post = await realPost();
		const root = await postComment(post.id, 'Top-level');

		await expect(postComment(post.id, 'Self-reply', root.id)).rejects.toThrow("Can't reply to your own comment.");
	});

	it('rejects a comment over the max length', async () => {
		const post = await realPost();
		await expect(postComment(post.id, 'a'.repeat(MAX_COMMENT_LENGTH + 1))).rejects.toThrow(
			`Comment exceeds the ${MAX_COMMENT_LENGTH} character limit.`
		);
	});

	it('accepts a comment at exactly the max length', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, 'a'.repeat(MAX_COMMENT_LENGTH));
		expect(comment.content).toHaveLength(MAX_COMMENT_LENGTH);
	});
});

describe('cross-relay-configuration visibility', () => {
	it("finds a comment via the post author's own declared relay, even when the commenter's and reader's own configured relays don't overlap at all", async () => {
		const authorKeyring = mainKeyring;
		await publishRelayList([{ url: 'wss://author-hub.example', read: true, write: true }], authorKeyring);
		const post = await realPost();

		__setPreferencesForTests({ nostrRelays: ['wss://commenter-only.example'] });
		__setKeyringForTests(generateKeyring());
		const comment = await postComment(post.id, 'From a differently-configured browser');

		__setPreferencesForTests({ nostrRelays: ['wss://reader-only.example'] });
		__setKeyringForTests(authorKeyring);

		const comments = await getCommentsForPost(post.id);
		expect(comments.map((c) => c.id)).toContain(comment.id);
	});
});

describe('deleteComment', () => {
	it('rejects deletion from a non-author', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, 'Mine');

		__setKeyringForTests(generateKeyring());
		await expect(deleteComment(comment.id)).rejects.toThrow('Only the author can delete this comment.');
	});

	it('still resolves the comment via getComment afterward, marked deleted', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, 'Bye');
		await deleteComment(comment.id);

		const fetched = await getComment(comment.id);
		expect(fetched.ok).toBe(true);
		expect(fetched.ok && fetched.doc.deleted).toBe(true);
	});
});

describe('getCommentsAuthoredBy', () => {
	it('finds comments posted by the given pubkey via an author-filtered query', async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const post = await realPost();
		const comment = await postComment(post.id, 'Mine, discoverable');

		const found = await getCommentsAuthoredBy(keyring.publicKey);
		expect(found.map((c) => c.id)).toEqual([comment.id]);
	});

	it("doesn't surface another author's comments", async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const post = await realPost();
		await postComment(post.id, 'Belongs to keyring');

		const otherKeyring = generateKeyring();
		expect(await getCommentsAuthoredBy(otherKeyring.publicKey)).toEqual([]);
	});
});
