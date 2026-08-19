import type { Filter } from 'nostr-tools';
import type { PubKey } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { publishEvent, queryEvents } from './event';
import { DELETE_REQUEST_KIND, REACTION_KIND } from './kinds';
import { postCoordinate } from './postId';
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
//
// A post is addressable (NIP-33), so votes on it target its stable
// coordinate (`a`/`A` tag) rather than a single revision's event id —
// otherwise editing a post (which publishes a new event id) would silently
// orphan every vote already cast on it. A comment is a regular, immutable
// event, so votes on it still target its event id (`e` tag).

export type VoteDirection = '+' | '-';

export type LikeTarget = { type: 'post'; id: string } | { type: 'comment'; id: string; author: PubKey };

export interface Score {
	up: number;
	down: number;
	score: number;
}

const EMPTY_SCORE: Score = { up: 0, down: 0, score: 0 };

/** The single string a target is filtered/tagged by — a coordinate for a
 *  post, a plain event id for a comment. */
function targetKey(target: LikeTarget): string {
	return target.type === 'post' ? postCoordinate(target.id) : target.id;
}

function targetTagName(target: LikeTarget): 'a' | 'e' {
	return target.type === 'post' ? 'a' : 'e';
}

function targetTags(target: LikeTarget): string[][] {
	const tags: string[][] = [[targetTagName(target), targetKey(target)]];
	if (target.type === 'comment') tags.push(['p', target.author]);
	return tags;
}

function targetFilter(target: LikeTarget): Filter {
	return target.type === 'post'
		? { kinds: [REACTION_KIND], '#a': [targetKey(target)] }
		: { kinds: [REACTION_KIND], '#e': [targetKey(target)] };
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
	const events = await queryEvents({ ...targetFilter(target), authors: [pubkey] }, getActiveRelays());
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

function aggregateScores(events: { tags: string[][]; content: string }[], tagName: 'a' | 'e', keys: string[]): Map<string, Score> {
	const scores = new Map<string, Score>();
	for (const key of keys) scores.set(key, { up: 0, down: 0, score: 0 });
	for (const event of events) {
		const key = event.tags.find((t) => t[0] === tagName)?.[1];
		if (!key) continue;
		const entry = scores.get(key);
		if (!entry) continue;
		if (event.content === '+') entry.up++;
		else if (event.content === '-') entry.down++;
	}
	for (const entry of scores.values()) entry.score = entry.up - entry.down;
	return scores;
}

/** Batched up/down score lookup for every post id in `ids`, in **one**
 *  relay round-trip (`{kinds:[7], '#a': coordinates}`) — what makes
 *  per-card score badges on a feed grid feasible instead of a query per
 *  thumbnail. Returned map is keyed by the same post ids passed in. */
export async function getScoresForPosts(ids: string[]): Promise<Map<string, Score>> {
	if (ids.length === 0) return new Map();
	const coordinates = ids.map(postCoordinate);
	const events = await queryEvents({ kinds: [REACTION_KIND], '#a': coordinates }, getActiveRelays());
	const byCoordinate = aggregateScores(events, 'a', coordinates);
	const byId = new Map<string, Score>();
	for (const id of ids) byId.set(id, byCoordinate.get(postCoordinate(id)) ?? EMPTY_SCORE);
	return byId;
}

/** Score for a single target — a thin wrapper for a post detail page or a
 *  single comment, where batching doesn't apply. */
export async function getScore(target: LikeTarget): Promise<Score> {
	if (target.type === 'post') {
		const scores = await getScoresForPosts([target.id]);
		return scores.get(target.id) ?? EMPTY_SCORE;
	}
	const events = await queryEvents(targetFilter(target), getActiveRelays());
	return aggregateScores(events, 'e', [target.id]).get(target.id) ?? EMPTY_SCORE;
}

/** Batched "which of these post ids has the current user already voted on,
 *  and which way" — same one-round-trip idiom as getScoresForPosts, so a
 *  feed grid can render filled/outlined vote buttons without a query per
 *  card. */
export async function getOwnVotesForPosts(ids: string[], pubkey: PubKey): Promise<Map<string, VoteDirection>> {
	if (ids.length === 0) return new Map();
	const coordinates = ids.map(postCoordinate);
	const events = await queryEvents({ kinds: [REACTION_KIND], '#a': coordinates, authors: [pubkey] }, getActiveRelays());
	const votes = new Map<string, VoteDirection>();
	const coordToId = new Map(ids.map((id) => [postCoordinate(id), id]));
	for (const event of events) {
		if (event.content !== '+' && event.content !== '-') continue;
		const coordinate = event.tags.find((t) => t[0] === 'a')?.[1];
		const id = coordinate ? coordToId.get(coordinate) : undefined;
		if (id) votes.set(id, event.content);
	}
	return votes;
}
