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

// $lib/db/deletedComments and $lib/db/deletedPosts (this file publishes
// posts via posts.ts too) wrap idb-keyval, which needs a real IndexedDB
// unavailable under plain Node/vitest — swap both for in-memory maps.
let deleteRequests: Record<string, number> = {};
vi.mock('$lib/db/deletedComments', () => ({
	loadDeleteRequestedMap: async () => deleteRequests,
	markCommentDeleteRequested: async (id: string) => {
		const timestamp = Date.now();
		deleteRequests = { ...deleteRequests, [id]: timestamp };
		return timestamp;
	}
}));
vi.mock('$lib/db/deletedPosts', () => ({
	loadPostDeleteRequestedMap: async () => ({}),
	markPostDeleteRequested: async () => Date.now()
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
	// content must be unique per call — see browse.test.ts's post() helper
	// for why (id collision when two calls land in the same second).
	return publishPost({ content: crypto.randomUUID(), images: oneImage, tags: [], rating: 'general' });
}

describe('postComment / getCommentsForPost', () => {
	it('posts a comment and finds it via a relay filter', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, post.author, 'Hello there');

		const comments = await getCommentsForPost(post.id, post.author);
		expect(comments).toHaveLength(1);
		expect(comments[0].id).toBe(comment.id);
		expect(comments[0].content).toBe('Hello there');
	});

	it('marks a deleted comment as deletion-requested rather than dropping it', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, post.author, 'Will be deleted');
		await deleteComment(comment.id);

		const comments = await getCommentsForPost(post.id, post.author);
		expect(comments).toHaveLength(1);
		expect(comments[0].deleted).toBe(true);
		expect(comments[0].deleted_at).not.toBeNull();
	});

	it("drops a comment event that doesn't actually match the requested post (never partially trusted)", async () => {
		const post = await realPost();
		const otherPost = await realPost();
		await postComment(otherPost.id, otherPost.author, 'Belongs elsewhere');

		expect(await getCommentsForPost(post.id, post.author)).toEqual([]);
	});

	it('posts a reply with parent_id set, alongside the top-level comment', async () => {
		const post = await realPost();
		const root = await postComment(post.id, post.author, 'Top-level');

		__setKeyringForTests(generateKeyring());
		const reply = await postComment(post.id, post.author, 'A reply', root.id);
		__setKeyringForTests(generateKeyring());

		expect(reply.parent_id).toBe(root.id);

		const comments = await getCommentsForPost(post.id, post.author);
		expect(comments).toHaveLength(2);
		expect(comments.find((c) => c.id === root.id)?.parent_id).toBeNull();
		expect(comments.find((c) => c.id === reply.id)?.parent_id).toBe(root.id);
	});

	it('rejects replying to your own comment', async () => {
		const post = await realPost();
		const root = await postComment(post.id, post.author, 'Top-level');

		await expect(postComment(post.id, post.author, 'Self-reply', root.id)).rejects.toThrow(
			"Can't reply to your own comment."
		);
	});

	it('rejects a comment over the max length', async () => {
		const post = await realPost();
		await expect(postComment(post.id, post.author, 'a'.repeat(MAX_COMMENT_LENGTH + 1))).rejects.toThrow(
			`Comment exceeds the ${MAX_COMMENT_LENGTH} character limit.`
		);
	});

	it('accepts a comment at exactly the max length', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, post.author, 'a'.repeat(MAX_COMMENT_LENGTH));
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
		const comment = await postComment(post.id, post.author, 'From a differently-configured browser');

		__setPreferencesForTests({ nostrRelays: ['wss://reader-only.example'] });
		__setKeyringForTests(authorKeyring);

		const comments = await getCommentsForPost(post.id, post.author);
		expect(comments.map((c) => c.id)).toContain(comment.id);
	});
});

describe('deleteComment', () => {
	it('rejects deletion from a non-author', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, post.author, 'Mine');

		__setKeyringForTests(generateKeyring());
		await expect(deleteComment(comment.id)).rejects.toThrow('Only the author can delete this comment.');
	});

	it('still resolves the comment via getComment afterward, marked deleted', async () => {
		const post = await realPost();
		const comment = await postComment(post.id, post.author, 'Bye');
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
		const comment = await postComment(post.id, post.author, 'Mine, discoverable');

		const found = await getCommentsAuthoredBy(keyring.publicKey);
		expect(found.map((c) => c.id)).toEqual([comment.id]);
	});

	it("doesn't surface another author's comments", async () => {
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);
		const post = await realPost();
		await postComment(post.id, post.author, 'Belongs to keyring');

		const otherKeyring = generateKeyring();
		expect(await getCommentsAuthoredBy(otherKeyring.publicKey)).toEqual([]);
	});
});
