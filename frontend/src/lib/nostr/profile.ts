import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { PubKey, User, Verified } from '$lib/types';
import { getKeyring } from '$lib/state/auth.svelte';
import { publishEvent, queryEvents, subscribeEvents, subscribeEventsWithRetry } from './event';
import { PROFILE_KIND } from './kinds';
import { claimUsername, normalizeUsername, releaseUsername } from './usernames';
import { readRelaysFor, writeRelaysFor } from './relayList';

/** NIP-01 kind-0 metadata's standard fields (`name`/`about`/`picture`).
 *  `openbooru_deleted` is an app-specific extra field carrying this app's
 *  tombstone flag — kind 0 has no NIP-level "deleted" concept, so a deleted
 *  profile still looks like a normal (if empty) profile to other Nostr
 *  clients, an accepted interoperability tradeoff of using a standard kind. */
interface ProfileContent {
	name: string;
	about: string;
	picture?: string;
	openbooru_deleted?: boolean;
}

function isProfileContent(data: unknown): data is ProfileContent {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return (
		typeof d.name === 'string' &&
		typeof d.about === 'string' &&
		(d.picture === undefined || typeof d.picture === 'string')
	);
}

function tagValue(tags: string[][], name: string): string | undefined {
	return tags.find((t) => t[0] === name)?.[1];
}

/** Parses a raw kind-0 event into the app-facing `User` shape. `created_at`
 *  is the profile's true original creation time (a `published_at` tag,
 *  carried forward on every edit) rather than the event's own `created_at`
 *  — kind 0 is a plain replaceable event, so a relay only retains the latest
 *  revision's timestamp. */
function eventToUser(event: NostrEvent): User | null {
	let content: unknown;
	try {
		content = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!isProfileContent(content)) return null;

	const publishedAt = tagValue(event.tags, 'published_at');
	const createdAt = publishedAt ? Number(publishedAt) * 1000 : event.created_at * 1000;

	return {
		id: event.pubkey,
		username: content.name,
		description: content.about,
		...(content.picture ? { image_url: content.picture } : {}),
		created_at: createdAt,
		updated_at: event.created_at * 1000,
		deleted: content.openbooru_deleted === true,
		deleted_at: content.openbooru_deleted === true ? event.created_at * 1000 : null
	};
}

function toVerified(event: NostrEvent): Verified<User> {
	const user = eventToUser(event);
	return user ? { ok: true, doc: user } : { ok: false, reason: 'invalid_schema' };
}

/** Reads the published profile at `pubkey`, or `{ok:false}` if none exists
 *  yet or fails validation. */
export async function getProfile(pubkey: PubKey): Promise<Verified<User>> {
	const relays = await readRelaysFor(pubkey);
	const events = await queryEvents({ kinds: [PROFILE_KIND], authors: [pubkey] }, relays);
	if (events.length === 0) return { ok: false, reason: 'invalid_schema' };
	const latest = events.reduce((a, b) => (b.created_at > a.created_at ? b : a));
	return toVerified(latest);
}

/** Resolves `pubkey`'s NIP-65 outbox relays before subscribing (see
 *  relayList.ts). Since relay resolution is async but this returns an
 *  unsubscribe function synchronously, an unsubscribe called before
 *  resolution finishes is honored by cancelling before the real subscription
 *  ever starts. */
export function subscribeProfile(pubkey: PubKey, onUpdate: (result: Verified<User>) => void): () => void {
	let unsubscribe: (() => void) | null = null;
	let cancelled = false;
	void readRelaysFor(pubkey).then((relays) => {
		if (cancelled) return;
		unsubscribe = subscribeEvents({ kinds: [PROFILE_KIND], authors: [pubkey] }, relays, (event) => onUpdate(toVerified(event)));
	});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Same as subscribeProfile, but also re-issues a one-shot query periodically
 *  until `isResolved` is true (see event.ts:subscribeEventsWithRetry) — public
 *  relays don't reliably answer a plain subscription on the first try. */
export function subscribeProfileWithRetry(
	pubkey: PubKey,
	onUpdate: (result: Verified<User>) => void,
	isResolved: () => boolean
): () => void {
	let unsubscribe: (() => void) | null = null;
	let cancelled = false;
	void readRelaysFor(pubkey).then((relays) => {
		if (cancelled) return;
		unsubscribe = subscribeEventsWithRetry(
			{ kinds: [PROFILE_KIND], authors: [pubkey] },
			relays,
			(event) => onUpdate(toVerified(event)),
			isResolved
		);
	});
	return () => {
		cancelled = true;
		unsubscribe?.();
	};
}

/** Signs and publishes the current user's profile. Preserves the original
 *  `published_at` from the existing published profile, if any (this is an
 *  edit, not a new doc). */
export async function publishProfile(fields: { username: string; description: string; image_url?: string }): Promise<User> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	const existing = await getProfile(keyring.publicKey);
	const previousUsername = existing.ok ? existing.doc.username : null;

	if (normalizeUsername(fields.username) !== (previousUsername ? normalizeUsername(previousUsername) : '')) {
		if (normalizeUsername(fields.username)) {
			await claimUsername(fields.username, keyring);
		}
		if (previousUsername) {
			await releaseUsername(previousUsername, keyring);
		}
	}

	const content: ProfileContent = {
		name: fields.username,
		about: fields.description,
		...(fields.image_url ? { picture: fields.image_url } : {})
	};
	const publishedAt = existing.ok ? Math.floor(existing.doc.created_at / 1000) : Math.floor(Date.now() / 1000);
	const template: EventTemplate = {
		kind: PROFILE_KIND,
		tags: [['published_at', String(publishedAt)]],
		content: JSON.stringify(content),
		created_at: Math.floor(Date.now() / 1000)
	};
	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(template, keyring, relays);
	const user = eventToUser(event);
	if (!user) throw new Error('Failed to publish profile.');
	return user;
}

/** Tombstones the current user's profile — a new revision with the
 *  app-specific `openbooru_deleted` content flag (peers who already synced
 *  can't be forced to erase it). */
export async function deleteProfile(): Promise<User> {
	const keyring = getKeyring();
	if (!keyring) throw new Error('No identity available yet — call initAuth() first.');
	const existing = await getProfile(keyring.publicKey);
	if (!existing.ok) throw new Error('No profile to delete.');

	const content: ProfileContent = {
		name: existing.doc.username,
		about: existing.doc.description,
		...(existing.doc.image_url ? { picture: existing.doc.image_url } : {}),
		openbooru_deleted: true
	};
	const template: EventTemplate = {
		kind: PROFILE_KIND,
		tags: [['published_at', String(Math.floor(existing.doc.created_at / 1000))]],
		content: JSON.stringify(content),
		created_at: Math.floor(Date.now() / 1000)
	};
	const relays = await writeRelaysFor(keyring);
	const event = await publishEvent(template, keyring, relays);
	const user = eventToUser(event);
	if (!user) throw new Error('Failed to delete profile.');
	return user;
}
