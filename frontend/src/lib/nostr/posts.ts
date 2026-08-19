import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { Keyring, Post, PostDraft, PostId, PostImage, PubKey, Verified } from '$lib/types';
import { isRating } from '$lib/types';
import { getKeyring, requireAccount } from '$lib/state/auth.svelte';
import { publishEvent, queryEvents } from './event';
import { DELETE_REQUEST_KIND, POST_KIND } from './kinds';
import { makePostId, parsePostId, postCoordinate } from './postId';
import { readRelaysFor, writeRelaysFor } from './relayList';

/** Builds a NIP-92-style `imeta` tag for one image — one such tag per image
 *  on the post event. Each element after the leading "imeta" is a
 *  "key value" pair encoded as a single string. */
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

/** Fields kept in the event's JSON `content` body. Everything else
 *  (identity, images, tags, rating, original creation time) is promoted to
 *  a tag instead. */
interface PostContent {
	content: string;
	version: number;
	deleted: boolean;
	deleted_at: number | null;
}

function isPostContent(data: unknown): data is PostContent {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.content === 'string' &&
		typeof d.version === 'number' &&
		typeof d.deleted === 'boolean' &&
		(d.deleted_at === null || typeof d.deleted_at === 'number')
	);
}

function tagValue(tags: string[][], name: string): string | undefined {
	return tags.find((t) => t[0] === name)?.[1];
}

/** Builds the unsigned event template for `doc` (see plan: tag schema).
 *  `doc.created_at` is the post's true original creation time (preserved
 *  across edits, unlike the event's own `created_at` — a NIP-33 relay only
 *  retains the latest revision's timestamp, so the original must be
 *  carried forward explicitly as the `published_at` tag). */
function postToTemplate(doc: Omit<Post, 'author' | 'updated_at'>): EventTemplate {
	const { uuid } = parsePostId(doc.id);
	const tags: string[][] = [
		['d', uuid],
		...doc.images.map(buildImetaTag),
		...doc.tags.map((t) => ['t', t]),
		['rating', doc.rating],
		['published_at', String(Math.floor(doc.created_at / 1000))]
	];
	// NIP-36: flag explicit content so any Nostr client can blur/hide it by
	// its own convention too, not just this app's rating filter.
	if (doc.rating === 'explicit') tags.push(['content-warning', 'explicit']);

	const content: PostContent = {
		content: doc.content,
		version: doc.version,
		deleted: doc.deleted,
		deleted_at: doc.deleted_at
	};

	return {
		kind: POST_KIND,
		tags,
		content: JSON.stringify(content),
		created_at: Math.floor(Date.now() / 1000)
	};
}

/** Parses a raw relay event back into the app-facing `Post` shape. Returns
 *  null (never partially trusted) if required tags/content are missing or
 *  malformed — a post schema has to carry at least one image and a `d`/
 *  `published_at` tag. */
export function eventToPost(event: NostrEvent): Post | null {
	const uuid = tagValue(event.tags, 'd');
	const publishedAt = tagValue(event.tags, 'published_at');
	if (!uuid || !publishedAt) return null;

	let content: unknown;
	try {
		content = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!isPostContent(content)) return null;

	const images = event.tags
		.filter((t) => t[0] === 'imeta')
		.map(parseImetaTag)
		.filter((img): img is PostImage => img !== null);
	if (images.length === 0) return null;

	const tags = event.tags.filter((t) => t[0] === 't' && t[1]).map((t) => t[1]);
	const ratingTag = event.tags.find((t) => t[0] === 'rating')?.[1];
	const hasContentWarning = event.tags.some((t) => t[0] === 'content-warning');
	const rating = ratingTag && isRating(ratingTag) ? ratingTag : hasContentWarning ? 'explicit' : 'general';

	return {
		id: `${event.pubkey}:${uuid}`,
		author: event.pubkey,
		images,
		tags,
		rating,
		content: content.content,
		version: content.version,
		created_at: Number(publishedAt) * 1000,
		updated_at: event.created_at * 1000,
		deleted: content.deleted,
		deleted_at: content.deleted_at
	};
}

function toVerified(event: NostrEvent): Verified<Post> {
	const post = eventToPost(event);
	return post ? { ok: true, doc: post } : { ok: false, reason: 'invalid_schema' };
}

async function signAndPublish(draft: Omit<Post, 'author' | 'updated_at'>, keyring: Keyring): Promise<Post> {
	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(postToTemplate(draft), keyring, relays);
	const parsed = eventToPost(event);
	if (!parsed) throw new Error('Failed to publish post.');
	return parsed;
}

export async function getPost(id: PostId): Promise<Verified<Post>> {
	const { author, uuid } = parsePostId(id);
	const relays = await readRelaysFor(author);
	const events = await queryEvents({ kinds: [POST_KIND], authors: [author], '#d': [uuid] }, relays);
	if (events.length === 0) return { ok: false, reason: 'invalid_schema' };
	const latest = events.reduce((a, b) => (b.created_at > a.created_at ? b : a));
	return toVerified(latest);
}

/** Lists every post id authored by `author` — ids only, unverified content
 *  beyond the signature check `queryEvents` already does. Used by
 *  browseByAuthor for a targeted per-author lookup. */
export async function listPostIdsByAuthor(author: PubKey): Promise<PostId[]> {
	const relays = await readRelaysFor(author);
	const events = await queryEvents({ kinds: [POST_KIND], authors: [author] }, relays);
	const uuids = new Set<string>();
	for (const event of events) {
		const uuid = tagValue(event.tags, 'd');
		if (uuid) uuids.add(uuid);
	}
	return Array.from(uuids).map((uuid) => `${author}:${uuid}`);
}

export async function listPostsByAuthor(author: PubKey): Promise<Post[]> {
	const ids = await listPostIdsByAuthor(author);
	const resolved = await Promise.all(ids.map((id) => getPost(id)));
	return resolved
		.filter((r): r is { ok: true; doc: Post } => r.ok)
		.map((r) => r.doc)
		.sort((a, b) => b.created_at - a.created_at);
}

/** Creates (no `draft.id`) or edits (with `draft.id`) a post. Editing is
 *  publishing a new revision under the same `d` tag with an incremented
 *  `version` — the post's id/coordinate never changes, so every comment
 *  and vote already cast on it stays attached across an edit. Only the
 *  author may edit. */
export async function publishPost(draft: PostDraft): Promise<Post> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	if (draft.images.length === 0) throw new Error('A post needs at least one image.');

	if (!draft.id) {
		return signAndPublish(
			{
				...draft,
				id: makePostId(keyring.publicKey),
				version: 1,
				deleted: false,
				deleted_at: null,
				created_at: Date.now()
			},
			keyring
		);
	}

	const existing = await getPost(draft.id);
	if (!existing.ok) throw new Error('Post not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can edit this post.');

	return signAndPublish(
		{
			...draft,
			id: existing.doc.id,
			version: existing.doc.version + 1,
			deleted: false,
			deleted_at: null,
			created_at: existing.doc.created_at
		},
		keyring
	);
}

async function publishDeleteRequest(id: PostId, keyring: Keyring): Promise<void> {
	try {
		const relays = await writeRelaysFor(keyring);
		await publishEvent(
			{ kind: DELETE_REQUEST_KIND, tags: [['a', postCoordinate(id)]], content: '', created_at: Math.floor(Date.now() / 1000) },
			keyring,
			relays
		);
	} catch (err) {
		// Best-effort only — relays aren't obligated to honor NIP-09, and the
		// tombstone revision below is what most peers will actually observe.
		console.warn('[nostr] delete request failed (ignored, tombstone revision still published)', err);
	}
}

/** Tombstones a post the current user authored — a new revision with
 *  `deleted: true` (relays that don't honor NIP-09 deletion still just see
 *  this as the latest, hidden-by-convention revision), alongside a
 *  best-effort NIP-09 delete request. */
export async function deletePost(id: PostId): Promise<Post> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();

	const existing = await getPost(id);
	if (!existing.ok) throw new Error('Post not found.');
	if (existing.doc.author !== keyring.publicKey) throw new Error('Only the author can delete this post.');

	const published = await signAndPublish(
		{ ...existing.doc, version: existing.doc.version + 1, deleted: true, deleted_at: Date.now() },
		keyring
	);
	await publishDeleteRequest(id, keyring);
	return published;
}

/** Reverses a "delete remote only" (see deletePost) — a new revision with
 *  `deleted: false` under the same id/version chain, so the post's id and
 *  every comment/vote already cast on it come back untouched. */
export async function undeletePost(existing: Post): Promise<Post> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	requireAccount();
	if (existing.author !== keyring.publicKey) throw new Error('Only the author can restore this post.');

	return signAndPublish({ ...existing, version: existing.version + 1, deleted: false, deleted_at: null }, keyring);
}
