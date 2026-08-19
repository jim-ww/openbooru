import type { Event as NostrEvent, EventTemplate } from 'nostr-tools';
import type { Keyring, PubKey, Verified } from '$lib/types';
import { publishEvent, queryEvents } from './event';
import { USERNAME_CLAIM_KIND } from './kinds';
import { writeRelaysFor } from './relayList';
import { getActiveRelays } from '$lib/state/preferences.svelte';

// Resolving "who holds this username" is inherently cross-author, so reads
// stay on the user's configured relay set (see getActiveRelays, matching the
// "browse everything" case) — only the claim/release publish itself resolves
// the current user's own NIP-65 outbox relays (see relayList.ts).

/** A claim on a normalized username — a NIP-33 addressable event, `d` = the
 *  normalized username. There is no separate `authorPub` field to
 *  validate: the event's own `pubkey`/signature already is that.
 *  "First-come-wins" is enforced client-side only: NIP-33 replaceable-event
 *  semantics only dedupe a single author's own revisions under a `d` tag —
 *  they do NOT give cross-author uniqueness, so two different authors can
 *  each hold their own live claim event under the same `d` value.
 *  `getUsernameClaim` resolves that by picking whichever live (non-deleted)
 *  claim was made first. */
export interface UsernameClaim {
	username: string;
	authorPub: PubKey;
	claimed_at: number;
	deleted: boolean;
}

interface ClaimContent {
	claimed_at: number;
	deleted: boolean;
}

function isClaimContent(data: unknown): data is ClaimContent {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	return typeof d.claimed_at === 'number' && typeof d.deleted === 'boolean';
}

function tagValue(tags: string[][], name: string): string | undefined {
	return tags.find((t) => t[0] === name)?.[1];
}

function eventToClaim(event: NostrEvent): UsernameClaim | null {
	const username = tagValue(event.tags, 'd');
	if (username === undefined) return null;
	let content: unknown;
	try {
		content = JSON.parse(event.content);
	} catch {
		return null;
	}
	if (!isClaimContent(content)) return null;

	return {
		username,
		authorPub: event.pubkey,
		claimed_at: content.claimed_at,
		deleted: content.deleted
	};
}

export function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

/** Reads the current claim on `username` across every author who has ever
 *  published one under this `d` tag — the earliest still-live claim wins
 *  (first-come-wins). Falls back to the most recently released claim (still
 *  marked `deleted`) if nobody currently holds it, or `{ok:false}` if it's
 *  never been claimed at all. */
export async function getUsernameClaim(username: string): Promise<Verified<UsernameClaim>> {
	const normalized = normalizeUsername(username);
	const events = await queryEvents({ kinds: [USERNAME_CLAIM_KIND], '#d': [normalized] }, getActiveRelays());
	const claims = events.map(eventToClaim).filter((c): c is UsernameClaim => c !== null);
	if (claims.length === 0) return { ok: false, reason: 'invalid_schema' };

	const live = claims.filter((c) => !c.deleted).sort((a, b) => a.claimed_at - b.claimed_at)[0];
	if (live) return { ok: true, doc: live };

	const mostRecentlyReleased = [...claims].sort((a, b) => b.claimed_at - a.claimed_at)[0];
	return { ok: true, doc: mostRecentlyReleased };
}

/** Claims `username` for `keyring`'s author. Throws if it's already validly
 *  claimed (and not released) by a different author. Re-claiming your own
 *  username preserves the original claim time. */
export async function claimUsername(username: string, keyring: Keyring): Promise<void> {
	const normalized = normalizeUsername(username);
	if (!normalized) throw new Error('Username cannot be empty.');

	const existing = await getUsernameClaim(normalized);
	if (existing.ok && !existing.doc.deleted && existing.doc.authorPub !== keyring.publicKey) {
		throw new Error('Username is already taken.');
	}

	const claimed_at =
		existing.ok && existing.doc.authorPub === keyring.publicKey ? existing.doc.claimed_at : Date.now();
	const template: EventTemplate = {
		kind: USERNAME_CLAIM_KIND,
		tags: [['d', normalized]],
		content: JSON.stringify({ claimed_at, deleted: false } satisfies ClaimContent),
		created_at: Math.floor(Date.now() / 1000)
	};
	const relays = await writeRelaysFor(keyring);
	await publishEvent(template, keyring, relays);
}

/** Releases `username`'s claim (tombstone), so it becomes available to
 *  others — used when a user changes their username. Silently does nothing
 *  if `keyring` doesn't actually hold the claim. */
export async function releaseUsername(username: string, keyring: Keyring): Promise<void> {
	const normalized = normalizeUsername(username);
	if (!normalized) return;
	const existing = await getUsernameClaim(normalized);
	if (!existing.ok || existing.doc.authorPub !== keyring.publicKey) return;

	const template: EventTemplate = {
		kind: USERNAME_CLAIM_KIND,
		tags: [['d', normalized]],
		content: JSON.stringify({ claimed_at: existing.doc.claimed_at, deleted: true } satisfies ClaimContent),
		created_at: Math.floor(Date.now() / 1000)
	};
	const relays = await writeRelaysFor(keyring);
	await publishEvent(template, keyring, relays);
}
