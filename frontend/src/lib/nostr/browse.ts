import type { Event as NostrEvent } from 'nostr-tools';
import type { Post } from '$lib/types';
import { getActiveRelays, getPreferences } from '$lib/state/preferences.svelte';
import { eventToPost, listPostsByAuthor } from './posts';
import { queryEvents, streamEvents } from './event';
import { POST_KIND } from './kinds';
import { getScoresForPosts } from './reactions';
import { resolveAuthorIdentifier } from './usernames';
import { parseSearchQuery } from '$lib/search/parseQuery';

/** Shared by every browse/search entry point below, so "tombstoned,
 *  blocked, or hidden-by-rating" is defined in exactly one place. */
function postPassesFilters(
	post: Post,
	blockedTags: string[],
	blockedAuthors: string[],
	visibleRatings: string[]
): boolean {
	if (post.deleted) return false;
	if (post.tags.some((t) => blockedTags.includes(t))) return false;
	if (blockedAuthors.includes(post.author)) return false;
	if (!visibleRatings.includes(post.rating)) return false;
	return true;
}

function parseAndFilter(events: NostrEvent[]): Post[] {
	const { blockedTags, blockedAuthors, visibleRatings } = getPreferences();
	const parsed = events.map(eventToPost).filter((p): p is Post => p !== null);
	return parsed.filter((p) => postPassesFilters(p, blockedTags, blockedAuthors, visibleRatings));
}

/** Fetches published posts carrying `tag`. */
export async function browseByTag(tag: string): Promise<Post[]> {
	const events = await queryEvents({ kinds: [POST_KIND], '#t': [tag] }, getActiveRelays());
	return parseAndFilter(events);
}

/** Fetches posts carrying every one of `tags` — relays only support OR
 *  within a single filter's tag-value list, so an AND search runs one query
 *  per tag and intersects the results client-side by (author, `d`) pair —
 *  a post's addressable identity, since editing a tag changes the event id
 *  but never the `d` tag. */
export async function searchByTags(tags: string[]): Promise<Post[]> {
	if (tags.length === 0) return [];
	const perTag = await Promise.all(tags.map((tag) => queryEvents({ kinds: [POST_KIND], '#t': [tag] }, getActiveRelays())));
	const addressKey = (e: NostrEvent) => `${e.pubkey}:${e.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
	const idSets = perTag.map((events) => new Set(events.map(addressKey)));
	const commonIds = idSets.reduce((a, b) => new Set([...a].filter((id) => b.has(id))));
	// Per address, keep only the latest revision seen across the per-tag
	// queries — a relay only ever returns one revision per (kind, author,
	// d), but different per-tag queries can still return different (older
	// vs. newer) revisions of the same post if a tag was added/removed
	// across an edit.
	const merged = new Map<string, NostrEvent>();
	for (const events of perTag) {
		for (const event of events) {
			const key = addressKey(event);
			if (!commonIds.has(key)) continue;
			const current = merged.get(key);
			if (!current || event.created_at > current.created_at) merged.set(key, event);
		}
	}
	return parseAndFilter([...merged.values()]);
}

/** Fetches published posts authored by `identifier`, which may be a claimed
 *  username, a raw hex author pubkey, or an `npub1...`-encoded one — the
 *  "@name" / "@pubkey" / "@npub" search syntax. */
export async function browseByAuthor(identifier: string): Promise<Post[]> {
	if (!identifier.trim()) return [];
	const authorPub = await resolveAuthorIdentifier(identifier);
	const posts = await listPostsByAuthor(authorPub);
	const { blockedTags, blockedAuthors, visibleRatings } = getPreferences();
	return posts.filter((p) => postPassesFilters(p, blockedTags, blockedAuthors, visibleRatings));
}

/** Applies a parsed search query's `rating`/`order:score` on top of an
 *  already-fetched post list — `order:new` is a no-op since every fetch
 *  path here already returns newest-first. */
async function applyRatingAndOrder(posts: Post[], rating: string | null, order: 'new' | 'score' | null): Promise<Post[]> {
	const filtered = rating ? posts.filter((p) => p.rating === rating) : posts;
	if (order !== 'score' || filtered.length === 0) return filtered;
	const scores = await getScoresForPosts(filtered.map((p) => p.id));
	return [...filtered].sort((a, b) => (scores.get(b.id)?.score ?? 0) - (scores.get(a.id)?.score ?? 0));
}

/** Top-level entry point for the search bar: parses Danbooru/Gelbooru-style
 *  query syntax (`tag1 tag2 -tag3 rating:general order:score`), resolves
 *  the include-tag AND search (or falls back to a plain network browse if
 *  the query has no include tags at all), then applies exclusion/rating/
 *  ordering on the result. */
export async function searchPosts(query: string): Promise<Post[]> {
	const parsed = parseSearchQuery(query);
	const base = parsed.includeTags.length > 0 ? await searchByTags(parsed.includeTags) : (await browseNetworkPage(null, 60)).posts;
	const withoutExcluded = base.filter((p) => !p.tags.some((t) => parsed.excludeTags.includes(t)));
	return applyRatingAndOrder(withoutExcluded, parsed.rating, parsed.order);
}

/** Opaque resume point for {@link browseNetworkPage}. `pool` holds
 *  already-fetched, already-sorted-by-`published_at` posts not yet returned
 *  to the caller; `nextUntil` is the relay-native (`created_at`-based)
 *  cursor for fetching more, or `null` once the relay side is exhausted. */
export interface BrowseCursor {
	pool: Post[];
	nextUntil: number | null;
}

/** How many post events to fetch per relay round-trip. Relays sort by
 *  their own event `created_at` (the latest-revision timestamp for these
 *  NIP-33 addressable events), not by `published_at` (the post's true
 *  original creation time) — over-fetching a batch and re-sorting it by
 *  `published_at` client-side (see below) is what keeps "sort by newest
 *  published" correct despite that mismatch, without requiring a relay-side
 *  sort it can't actually offer. Editing a post bumps its relay-side
 *  `created_at` to "now" without changing when it was first published, so
 *  without this an edited post would jump to the top of a newest-first feed. */
const FETCH_BATCH_SIZE = 40;

async function fetchBatch(
	until: number | undefined,
	onPost?: (post: Post) => void
): Promise<{ posts: Post[]; oldestCreatedAt: number | null; count: number }> {
	const { blockedTags, blockedAuthors, visibleRatings } = getPreferences();
	const posts: Post[] = [];
	let oldestCreatedAt: number | null = null;
	let count = 0;
	await streamEvents(
		{ kinds: [POST_KIND], limit: FETCH_BATCH_SIZE, ...(until !== undefined ? { until } : {}) },
		getActiveRelays(),
		(event) => {
			count++;
			oldestCreatedAt = oldestCreatedAt === null ? event.created_at : Math.min(oldestCreatedAt, event.created_at);
			const post = eventToPost(event);
			if (!post || !postPassesFilters(post, blockedTags, blockedAuthors, visibleRatings)) return;
			posts.push(post);
			onPost?.(post);
		}
	);
	return { posts, oldestCreatedAt, count };
}

export function sortByPublishedAt(posts: Post[]): Post[] {
	return [...posts].sort((a, b) => b.created_at - a.created_at);
}

/** Pages through the network feed sorted by `published_at` (true original
 *  creation time), walking the relay-native `until` cursor forward and
 *  over-fetching/re-sorting each batch (see FETCH_BATCH_SIZE comment).
 *  Pass the previous call's returned cursor to continue; pass `null` to
 *  start fresh. Returns a `null` cursor once fully exhausted.
 *
 *  `onPost`, when given, fires for each post as its event streams in (see
 *  fetchBatch/streamEvents) — a "preview as it arrives" side channel for a
 *  caller that wants to paint cards incrementally; the returned
 *  `posts`/`cursor` stay the single source of truth for pagination state
 *  either way. */
export async function browseNetworkPage(
	cursor: BrowseCursor | null,
	pageSize: number,
	onPost?: (post: Post) => void
): Promise<{ posts: Post[]; cursor: BrowseCursor | null }> {
	let pool = cursor?.pool ?? [];
	let nextUntil = cursor ? cursor.nextUntil : (undefined as number | null | undefined);

	while (pool.length < pageSize && nextUntil !== null) {
		const batch = await fetchBatch(nextUntil === undefined ? undefined : nextUntil, onPost);
		pool = sortByPublishedAt(pool.concat(batch.posts));
		if (batch.count < FETCH_BATCH_SIZE || batch.oldestCreatedAt === null) {
			nextUntil = null;
		} else {
			nextUntil = batch.oldestCreatedAt - 1;
		}
	}

	const posts = pool.slice(0, pageSize);
	const remaining = pool.slice(pageSize);
	const exhausted = remaining.length === 0 && (nextUntil === null || nextUntil === undefined);
	return {
		posts,
		cursor: exhausted ? null : { pool: remaining, nextUntil: nextUntil ?? null }
	};
}

