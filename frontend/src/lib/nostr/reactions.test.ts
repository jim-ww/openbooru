import { describe, it, expect, beforeEach } from 'vitest';
import { __setKeyringForTests } from '$lib/state/auth.svelte';
import { generateKeyring } from './keys';
import { __setPoolForTests } from './pool';
import { createFakePool } from './testUtils';
import { publishPost } from './posts';
import { vote, findOwnVote, getScoresForPosts, getScore, getOwnVotesForPosts, type LikeTarget } from './reactions';

beforeEach(() => {
	__setPoolForTests(createFakePool().pool);
	__setKeyringForTests(generateKeyring());
});

const oneImage = [{ url: 'https://blossom.example/abc.jpg' }];

async function realTarget(): Promise<LikeTarget> {
	// content must be unique per call — a NIP-01 event id hashes
	// [pubkey, created_at, kind, tags, content], and two calls back-to-back
	// can land in the same second, so identical content would produce
	// identical (colliding) ids for what should be two distinct posts.
	const post = await publishPost({ content: crypto.randomUUID(), images: oneImage, tags: [], rating: 'general' });
	return { type: 'post', id: post.id };
}

describe('vote / findOwnVote', () => {
	it('upvotes an unvoted target', async () => {
		const target = await realTarget();
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		const result = await vote(target, '+');
		expect(result).toBe('+');
		expect(await findOwnVote(target, keyring.publicKey)).toEqual(expect.objectContaining({ direction: '+' }));
	});

	it('removes the vote when cast a second time in the same direction', async () => {
		const target = await realTarget();
		__setKeyringForTests(generateKeyring());

		await vote(target, '+');
		const result = await vote(target, '+');
		expect(result).toBeNull();
	});

	it('switches from upvote to downvote', async () => {
		const target = await realTarget();
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		await vote(target, '+');
		const result = await vote(target, '-');
		expect(result).toBe('-');

		const own = await findOwnVote(target, keyring.publicKey);
		expect(own?.direction).toBe('-');
	});

	it("doesn't confuse two different targets' votes", async () => {
		const a = await realTarget();
		const b = await realTarget();
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		await vote(a, '+');
		expect(await findOwnVote(b, keyring.publicKey)).toBeNull();
	});
});

describe('getScoresForPosts / getScore', () => {
	it('aggregates up/down votes into a net score', async () => {
		const target = await realTarget();

		__setKeyringForTests(generateKeyring());
		await vote(target, '+');
		__setKeyringForTests(generateKeyring());
		await vote(target, '+');
		__setKeyringForTests(generateKeyring());
		await vote(target, '-');

		expect(await getScore(target)).toEqual({ up: 2, down: 1, score: 1 });
	});

	it('batches scores for multiple ids in one call, defaulting unvoted ids to zero', async () => {
		const a = await realTarget();
		const b = await realTarget();

		__setKeyringForTests(generateKeyring());
		await vote(a, '+');

		const scores = await getScoresForPosts([a.id, b.id]);
		expect(scores.get(a.id)).toEqual({ up: 1, down: 0, score: 1 });
		expect(scores.get(b.id)).toEqual({ up: 0, down: 0, score: 0 });
	});

	it('returns an empty map for an empty id list without querying', async () => {
		expect(await getScoresForPosts([])).toEqual(new Map());
	});
});

describe('getOwnVotesForPosts', () => {
	it("batches the current user's own vote direction across multiple ids", async () => {
		const a = await realTarget();
		const b = await realTarget();
		const keyring = generateKeyring();
		__setKeyringForTests(keyring);

		await vote(a, '+');
		await vote(b, '-');

		const votes = await getOwnVotesForPosts([a.id, b.id], keyring.publicKey);
		expect(votes.get(a.id)).toBe('+');
		expect(votes.get(b.id)).toBe('-');
	});

	it("doesn't include another user's vote", async () => {
		const target = await realTarget();
		__setKeyringForTests(generateKeyring());
		await vote(target, '+');

		const someoneElse = generateKeyring();
		const votes = await getOwnVotesForPosts([target.id], someoneElse.publicKey);
		expect(votes.has(target.id)).toBe(false);
	});
});
