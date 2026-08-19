import type { PubKey } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { publishEvent, queryEvents } from './event';
import { DELETE_REQUEST_KIND, REACTION_KIND } from './kinds';
import { writeRelaysFor } from './relayList';
import { getActiveRelays } from '$lib/state/preferences.svelte';

// Reactions need to be visible to anyone browsing the target, not just its
// author, so reads stay on the user's configured relay set (see
// getActiveRelays, matching the "browse everything" case) — only the
// vote/unvote publish itself resolves the current user's own NIP-65 outbox
// relays (see relayList.ts), same as every other publish path.
//
// Danbooru/Gelbooru-style up/down score voting, not a plain like: still a
// NIP-25 (kind 7) reaction — the NIP places no constraint on `content`
// beyond "+"/"-" being the conventional like/dislike values, which is
// exactly the up/down vocabulary this needs. A relay's NIP-45 COUNT can't
// filter by `content`, so there is no relay-side way to get the up/down
// split directly — scores are computed by fetching the actual reaction
// events and aggregating client-side (see getScoresForPosts, batched one
// query per visible page rather than one query per post).

export type VoteDirection = '+' | '-';

export type LikeTarget =
	| { type: 'post'; id: string; author: PubKey }
	| { type: 'comment'; id: string; author: PubKey };

export interface Score {
	up: number;
	down: number;
	score: number;
}

const EMPTY_SCORE: Score = { up: 0, down: 0, score: 0 };

function targetTags(target: LikeTarget): string[][] {
	return [
		['e', target.id],
		['p', target.author]
	];
}

/** Returns the current user's own vote event on `target`, if any. Picks the
 *  most recently published match rather than just the first one returned —
 *  a NIP-09 delete request is only best-effort, so an older superseded vote
 *  can still be sitting in a relay's store alongside the new one, and
 *  relay result order isn't guaranteed to reflect publish order. */
export async function findOwnVote(
	target: LikeTarget,
	pubkey: PubKey
): Promise<{ id: string; direction: VoteDirection } | null> {
	const events = await queryEvents({ kinds: [REACTION_KIND], '#e': [target.id], authors: [pubkey] }, getActiveRelays());
	const votes = events.filter((e) => e.content === '+' || e.content === '-');
	if (votes.length === 0) return null;
	// >= (not >) so that on a same-second tie, the later entry in relay
	// result order — which for a same-session vote switch is the more
	// recently published one — wins over the first.
	const latest = votes.reduce((a, b) => (b.created_at >= a.created_at ? b : a));
	return { id: latest.id, direction: latest.content as VoteDirection };
}

async function publishDeleteRequest(eventId: string, keyring: import('$lib/types').Keyring): Promise<void> {
	try {
		const relays = await writeRelaysFor(keyring);
		await publishEvent(
			{ kind: DELETE_REQUEST_KIND, tags: [['e', eventId]], content: '', created_at: Math.floor(Date.now() / 1000) },
			keyring,
			relays
		);
	} catch (err) {
		console.warn('[nostr] vote-removal delete request failed (ignored, best-effort only)', err);
	}
}

/** Casts (or removes) a vote on `target`. Voting the same direction again
 *  removes the vote (toggle-off); voting the opposite direction switches it.
 *  Returns the resulting direction, or `null` if the vote was removed. Any
 *  previous vote is retracted via a best-effort NIP-09 delete request. */
export async function vote(target: LikeTarget, direction: VoteDirection): Promise<VoteDirection | null> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await findOwnVote(target, keyring.publicKey);
	if (existing) {
		await publishDeleteRequest(existing.id, keyring);
		if (existing.direction === direction) return null;
	}

	const relays = await writeRelaysFor(keyring);
	await publishEvent(
		{ kind: REACTION_KIND, tags: targetTags(target), content: direction, created_at: Math.floor(Date.now() / 1000) },
		keyring,
		relays
	);
	return direction;
}

function aggregateScores(events: { tags: string[][]; content: string }[], targetIds: string[]): Map<string, Score> {
	const scores = new Map<string, Score>();
	for (const id of targetIds) scores.set(id, { up: 0, down: 0, score: 0 });
	for (const event of events) {
		const targetId = event.tags.find((t) => t[0] === 'e')?.[1];
		if (!targetId) continue;
		const entry = scores.get(targetId);
		if (!entry) continue;
		if (event.content === '+') entry.up++;
		else if (event.content === '-') entry.down++;
	}
	for (const entry of scores.values()) entry.score = entry.up - entry.down;
	return scores;
}

/** Batched up/down score lookup for every id in `ids`, in **one** relay
 *  round-trip (`{kinds:[7], '#e': ids}`) — what makes per-card score badges
 *  on a feed grid feasible instead of a query per thumbnail. Works for any
 *  event-id-targeted reaction, posts or comments alike. */
export async function getScoresForPosts(ids: string[]): Promise<Map<string, Score>> {
	if (ids.length === 0) return new Map();
	const events = await queryEvents({ kinds: [REACTION_KIND], '#e': ids }, getActiveRelays());
	return aggregateScores(events, ids);
}

/** Score for a single target — a thin wrapper over {@link getScoresForPosts}
 *  for a post detail page or a single comment, where batching doesn't apply. */
export async function getScore(target: LikeTarget): Promise<Score> {
	const scores = await getScoresForPosts([target.id]);
	return scores.get(target.id) ?? EMPTY_SCORE;
}

/** Batched "which of these ids has the current user already voted on, and
 *  which way" — same one-round-trip idiom as getScoresForPosts, so a feed
 *  grid can render filled/outlined vote buttons without a query per card. */
export async function getOwnVotesForPosts(ids: string[], pubkey: PubKey): Promise<Map<string, VoteDirection>> {
	if (ids.length === 0) return new Map();
	const events = await queryEvents({ kinds: [REACTION_KIND], '#e': ids, authors: [pubkey] }, getActiveRelays());
	const votes = new Map<string, VoteDirection>();
	for (const event of events) {
		if (event.content !== '+' && event.content !== '-') continue;
		const targetId = event.tags.find((t) => t[0] === 'e')?.[1];
		if (targetId) votes.set(targetId, event.content);
	}
	return votes;
}
