import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { Post, PostId, PostImage, Verified } from '$lib/types';
import { isRating } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { loadPostDeleteRequestedMap, markPostDeleteRequested } from '$lib/db/deletedPosts';
import { publishEvent, queryEvents } from './event';
import { DELETE_REQUEST_KIND, POST_KIND } from './kinds';
import { readRelaysFor, writeRelaysFor } from './relayList';
import { getActiveRelays } from '$lib/state/preferences.svelte';

/** Builds a NIP-92-style `imeta` tag for one image — one such tag per image
 *  on the post event, per NIP-68. Each element after the leading "imeta" is
 *  a "key value" pair encoded as a single string. */
function buildImetaTag(image: PostImage): string[] {
	const tag = ['imeta', `url ${image.url}`];
	if (image.mime) tag.push(`m ${image.mime}`);
	if (image.sha256) tag.push(`x ${image.sha256}`);
	if (image.dim) tag.push(`dim ${image.dim}`);
	if (image.size !== undefined) tag.push(`size ${image.size}`);
	for (const fallback of image.fallbackUrls ?? []) tag.push(`fallback ${fallback}`);
	return tag;
}

function parseImetaTag(tag: string[]): PostImage | null {
	let url: string | undefined;
	let mime: string | undefined;
	let sha256: string | undefined;
	let dim: string | undefined;
	let size: number | undefined;
	const fallbackUrls: string[] = [];
	for (const entry of tag.slice(1)) {
		const spaceIndex = entry.indexOf(' ');
		if (spaceIndex === -1) continue;
		const key = entry.slice(0, spaceIndex);
		const value = entry.slice(spaceIndex + 1);
		if (key === 'url') url = value;
		else if (key === 'm') mime = value;
		else if (key === 'x') sha256 = value;
		else if (key === 'dim') dim = value;
		else if (key === 'size') size = Number(value) || undefined;
		else if (key === 'fallback') fallbackUrls.push(value);
	}
	if (!url) return null;
	return {
		url,
		...(mime ? { mime } : {}),
		...(sha256 ? { sha256 } : {}),
		...(dim ? { dim } : {}),
		...(size !== undefined ? { size } : {}),
		...(fallbackUrls.length ? { fallbackUrls } : {})
	};
}

/** Parses a raw kind-20 event into the app-facing `Post` shape. Requires at
 *  least one valid `imeta` tag — a post schema has to carry an image, never
 *  partially trusted (see spec: dropped, not partially trusted). `deleted`/
 *  `deleted_at` come from this browser's own local delete-request record
 *  (see db/deletedPosts.ts) — posts are immutable Nostr events, so there is
 *  no network-level tombstone to read instead. */
export function eventToPost(event: NostrEvent, deletedMap: Record<PostId, number>): Post | null {
	const images = event.tags
		.filter((t) => t[0] === 'imeta')
		.map(parseImetaTag)
		.filter((img): img is PostImage => img !== null);
	if (images.length === 0) return null;

	const tags = event.tags.filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
	const ratingTag = event.tags.find((t) => t[0] === 'rating')?.[1];
	const hasContentWarning = event.tags.some((t) => t[0] === 'content-warning');
	const rating = ratingTag && isRating(ratingTag) ? ratingTag : hasContentWarning ? 'explicit' : 'general';

	const deletedAt = deletedMap[event.id] ?? null;

	return {
		id: event.id,
		author: event.pubkey,
		content: event.content,
		images,
		tags,
		rating,
		created_at: event.created_at * 1000,
		updated_at: event.created_at * 1000,
		deleted: deletedAt !== null,
		deleted_at: deletedAt
	};
}

export async function getPost(id: PostId): Promise<Verified<Post>> {
	const events = await queryEvents({ ids: [id], kinds: [POST_KIND] }, getActiveRelays());
	if (events.length === 0) return { ok: false, reason: 'invalid_schema' };
	const deletedMap = await loadPostDeleteRequestedMap();
	const post = eventToPost(events[0], deletedMap);
	return post ? { ok: true, doc: post } : { ok: false, reason: 'invalid_schema' };
}

/** Batched lookup for `ids` in one relay round-trip — an `ids` filter
 *  naturally accepts a list, so this is preferable to N calls to getPost
 *  when a caller (e.g. a saved/liked list) already knows the ids it wants. */
export async function getPosts(ids: PostId[]): Promise<Post[]> {
	if (ids.length === 0) return [];
	const events = await queryEvents({ ids, kinds: [POST_KIND] }, getActiveRelays());
	const deletedMap = await loadPostDeleteRequestedMap();
	return events.map((e) => eventToPost(e, deletedMap)).filter((p): p is Post => p !== null);
}

export async function listPostsByAuthor(pubkey: string): Promise<Post[]> {
	const relays = await readRelaysFor(pubkey);
	const events = await queryEvents({ kinds: [POST_KIND], authors: [pubkey] }, relays);
	const deletedMap = await loadPostDeleteRequestedMap();
	return events
		.map((e) => eventToPost(e, deletedMap))
		.filter((p): p is Post => p !== null)
		.sort((a, b) => b.created_at - a.created_at);
}

export interface PublishPostFields {
	content: string;
	images: PostImage[];
	tags: string[];
	rating: Post['rating'];
}

export async function publishPost(fields: PublishPostFields): Promise<Post> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	if (fields.images.length === 0) throw new Error('A post needs at least one image.');

	const tags: string[][] = fields.images.map(buildImetaTag);
	for (const tag of fields.tags) tags.push(['t', tag]);
	tags.push(['rating', fields.rating]);
	// NIP-36: flag explicit content so any Nostr client can blur/hide it by
	// its own convention too, not just this app's rating filter.
	if (fields.rating === 'explicit') tags.push(['content-warning', 'explicit']);

	const template: EventTemplate = {
		kind: POST_KIND,
		tags,
		content: fields.content,
		created_at: Math.floor(Date.now() / 1000)
	};
	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(template, keyring, relays);
	const deletedMap = await loadPostDeleteRequestedMap();
	const post = eventToPost(event, deletedMap);
	if (!post) throw new Error('Failed to publish post.');
	return post;
}

/** Requests deletion of a post the current user authored. Posts are
 *  immutable kind-20 events, so — like comments, unlike an addressable/
 *  replaceable event — there is no revision to tombstone; a NIP-09 delete
 *  request is published best-effort, and this browser separately records
 *  the request locally so its own UI can render the post as "deletion
 *  requested" regardless of whether any relay actually honors it. */
export async function deletePost(id: PostId): Promise<Post> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getPost(id);
	if (!existing.ok) throw new Error('Post not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this post.');

	const deletedAt = await markPostDeleteRequested(id);
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
