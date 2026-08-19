import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import { type Comment, type CommentId, MAX_COMMENT_LENGTH, type PostId, type Verified } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { loadDeleteRequestedMap, markCommentDeleteRequested } from '$lib/db/deletedComments';
import { publishEvent, queryEvents } from './event';
import { COMMENT_KIND, DELETE_REQUEST_KIND, POST_KIND } from './kinds';
import { readRelaysFor, writeRelaysFor } from './relayList';
import { getActiveRelays } from '$lib/state/preferences.svelte';

// Comments on a post aren't scoped to a single author (anyone can comment),
// so there's no single commenter to resolve outbox relays for — but every
// comment does have one fixed anchor: the post itself. Both posting and
// reading a post's comments include the post author's own declared write
// relays (readRelaysFor) alongside the user's configured set
// (getActiveRelays), the same "publish a reply where the thread's root is
// likely to be read" convention NIP-65 recommends — otherwise a comment
// posted from a commenter's own relay-only setup can be invisible to anyone
// reading the post from a different (non-overlapping) relay set.
//
// Unlike charshare's character (a NIP-33 addressable/replaceable event), a
// post (kind 20) is a regular, immutable event with no stable coordinate —
// so NIP-22's root-scope tags here are event-id-based (`E`/`e`), not
// coordinate-based (`A`/`a`).

function tagValue(tags: string[][], name: string): string | undefined {
	return tags.find((t) => t[0] === name)?.[1];
}

/** Parses a raw relay event into the app-facing `Comment` shape. `deleted`/
 *  `deleted_at` come from this browser's own local delete-request record
 *  (see db/deletedComments.ts) — comments are immutable Nostr events, so
 *  there is no network-level tombstone to read instead. Returns null (never
 *  partially trusted) if the required root-scope tag is missing. */
function eventToComment(event: NostrEvent, deletedMap: Record<CommentId, number>): Comment | null {
	const postId = tagValue(event.tags, 'E');
	if (!postId) return null;
	const parentEventId = tagValue(event.tags, 'e');
	const deletedAt = deletedMap[event.id] ?? null;

	return {
		id: event.id,
		post_id: postId,
		content: event.content,
		parent_id: parentEventId ?? null,
		author: event.pubkey,
		created_at: event.created_at * 1000,
		updated_at: event.created_at * 1000,
		deleted: deletedAt !== null,
		deleted_at: deletedAt
	};
}

export async function getComment(id: CommentId): Promise<Verified<Comment>> {
	const events = await queryEvents({ ids: [id], kinds: [COMMENT_KIND] }, getActiveRelays());
	if (events.length === 0) return { ok: false, reason: 'invalid_schema' };
	const deletedMap = await loadDeleteRequestedMap();
	const comment = eventToComment(events[0], deletedMap);
	return comment ? { ok: true, doc: comment } : { ok: false, reason: 'invalid_schema' };
}

/** Fetches every comment on `postId`, including ones this browser has
 *  locally requested deletion of (rendered dimmed/struck-through by the UI,
 *  not hidden — a relay that actually honored the NIP-09 request simply
 *  won't have returned it here at all). Drops anything that fails schema/
 *  signature verification or doesn't actually belong to `postId` (never
 *  partially trust).
 *
 *  Filters on the lowercase `e` tag, not NIP-22's own uppercase `E` (root
 *  scope) — every comment event carries both (see postComment), but several
 *  minimal/local relay implementations only maintain query indexes for the
 *  common lowercase single-letter tags and don't index uncommon uppercase
 *  ones like NIP-22's, silently returning nothing for an `#E` filter even
 *  though the events are actually stored there. `eventToComment` below still
 *  reads the real root back off the (uppercase) `E` tag on whatever's
 *  returned — this only changes what the relay is asked to filter by. */
export async function getCommentsForPost(postId: PostId, postAuthor: string): Promise<Comment[]> {
	const relays = Array.from(new Set([...getActiveRelays(), ...(await readRelaysFor(postAuthor))]));
	const events = await queryEvents({ kinds: [COMMENT_KIND], '#e': [postId] }, relays);
	const deletedMap = await loadDeleteRequestedMap();
	return events
		.map((e) => eventToComment(e, deletedMap))
		.filter((c): c is Comment => c !== null && c.post_id === postId)
		.sort((a, b) => a.created_at - b.created_at);
}

/** Lists the comments `pubkey` has posted, found via a plain author-filtered
 *  relay query — no separate per-author index needed, since relays natively
 *  support `authors` filters. */
export async function getCommentsAuthoredBy(pubkey: string): Promise<Comment[]> {
	const relays = await readRelaysFor(pubkey);
	const events = await queryEvents({ kinds: [COMMENT_KIND], authors: [pubkey] }, relays);
	const deletedMap = await loadDeleteRequestedMap();
	return events
		.map((e) => eventToComment(e, deletedMap))
		.filter((c): c is Comment => c !== null && c.author === pubkey)
		.sort((a, b) => b.created_at - a.created_at);
}

export async function postComment(
	postId: PostId,
	postAuthor: string,
	content: string,
	parentId: CommentId | null = null,
	// The comment actually being replied to, for the "can't reply to your own
	// comment" check below — distinct from parentId, which is always the
	// thread's root (replies are flattened one level deep, so replying to a
	// reply still stores parent_id = the root, not that reply's id).
	replyToId: CommentId | null = parentId
): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	if (content.length > MAX_COMMENT_LENGTH) {
		throw new Error(`Comment exceeds the ${MAX_COMMENT_LENGTH} character limit.`);
	}

	if (replyToId) {
		const replyTo = await getComment(replyToId);
		if (replyTo.ok && replyTo.doc.author === keyring.publicKey) {
			throw new Error("Can't reply to your own comment.");
		}
	}

	// NIP-22: uppercase tags scope the root (the post being commented on);
	// lowercase tags scope the immediate parent. Flattened to one level
	// (parent always = thread root) to match the app's reply UX.
	const tags: string[][] = [
		['E', postId],
		['K', String(POST_KIND)],
		['P', postAuthor],
		['e', postId]
	];
	if (parentId) {
		const parent = await getComment(parentId);
		tags.push(['e', parentId], ['k', String(COMMENT_KIND)]);
		if (parent.ok) tags.push(['p', parent.doc.author]);
	} else {
		tags.push(['k', String(POST_KIND)], ['p', postAuthor]);
	}

	const template: EventTemplate = {
		kind: COMMENT_KIND,
		tags,
		content,
		created_at: Math.floor(Date.now() / 1000)
	};

	// Published to the commenter's own outbox relays *and* the post
	// author's — so it's discoverable from either side regardless of whose
	// relay set a later reader happens to be querying (see module doc comment).
	const relays = Array.from(new Set([...(await writeRelaysFor(keyring)), ...(await readRelaysFor(postAuthor))]));
	const event = await publishEvent(template, keyring, relays);
	const deletedMap = await loadDeleteRequestedMap();
	const comment = eventToComment(event, deletedMap);
	if (!comment) throw new Error('Failed to publish comment.');
	return comment;
}

/** Requests deletion of a comment the current user authored. Comments are
 *  immutable NIP-22 events, so there is no revision to tombstone; a NIP-09
 *  delete request is published best-effort, and this browser separately
 *  records the request locally so its own UI can render the comment as
 *  "deletion requested" regardless of whether any relay actually honors the
 *  NIP-09 event. */
export async function deleteComment(id: CommentId): Promise<Comment> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getComment(id);
	if (!existing.ok) throw new Error('Comment not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this comment.');

	const deletedAt = await markCommentDeleteRequested(id);
	try {
		const relays = await writeRelaysFor(keyring);
		await publishEvent(
			{ kind: DELETE_REQUEST_KIND, tags: [['e', id]], content: '', created_at: Math.floor(Date.now() / 1000) },
			keyring,
			relays
		);
	} catch (err) {
		console.warn('[nostr] delete request failed (ignored, still marked deletion-requested locally)', err);
	}

	return { ...existing.doc, deleted: true, deleted_at: deletedAt };
}
