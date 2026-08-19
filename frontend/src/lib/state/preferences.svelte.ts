import { browser } from '$app/environment';
import { get, set } from '$lib/crypto/dataEncryption';
import type { Preferences } from '$lib/types';
import { DEFAULT_NOSTR_RELAYS } from '$lib/nostr/relays';
import { DEFAULT_BLOSSOM_SERVERS } from '$lib/blossom/servers';

const STORAGE_KEY = 'openbooru:preferences';

export const DEFAULT_PREFERENCES: Preferences = {
	nostrRelays: DEFAULT_NOSTR_RELAYS,
	blossomServers: DEFAULT_BLOSSOM_SERVERS,
	blockedTags: [],
	blockedAuthors: [],
	hiddenPostIds: [],
	hiddenCommentIds: [],
	visibleRatings: ['general', 'sensitive'],
	theme: 'system',
	gridDensity: 'small'
};

let preferences = $state<Preferences>(DEFAULT_PREFERENCES);
let ready = $state(false);
let initPromise: Promise<void> | null = null;

export function getPreferences(): Preferences {
	return preferences;
}

/** The relay set the app actually talks to right now — the user's own
 *  configured `nostrRelays` (see Settings). A fresh install starts from
 *  `DEFAULT_NOSTR_RELAYS` (set as the initial preference value), but if the
 *  user deliberately clears the list down to nothing, that's treated as
 *  offline mode (see isOfflineMode) rather than silently falling back to
 *  the defaults — otherwise there would be no way to actually go offline.
 *  Read fresh (not cached) by every nostr/*.ts network call so an
 *  in-session relay-list change takes effect immediately. */
export function getActiveRelays(): string[] {
	return preferences.nostrRelays;
}

/** True once the user has cleared their relay list down to nothing — every
 *  nostr/*.ts network call becomes a no-op against an empty relay set, so
 *  the UI should treat this as "offline" rather than "the network
 *  legitimately has zero results." */
export function isOfflineMode(): boolean {
	return getActiveRelays().length === 0;
}

/** Configured Blossom servers, in priority order — same "read fresh, empty
 *  means opt out" idiom as getActiveRelays. */
export function getActiveBlossomServers(): string[] {
	return preferences.blossomServers;
}

export function isPreferencesReady(): boolean {
	return ready;
}

/** Loads preferences from IndexedDB, falling back to defaults on first run.
 *  Safe to call multiple times; the underlying load only happens once. */
export function initPreferences(): Promise<void> {
	if (!browser) return Promise.resolve();
	if (!initPromise) {
		initPromise = (async () => {
			const stored = await get<Preferences>(STORAGE_KEY);
			if (stored) {
				// Backfills fields added after a preferences blob was already
				// saved, so an older install doesn't crash on a missing field.
				preferences = {
					...DEFAULT_PREFERENCES,
					...stored,
					blossomServers: stored.blossomServers ?? DEFAULT_BLOSSOM_SERVERS,
					visibleRatings: stored.visibleRatings ?? ['general', 'sensitive'],
					gridDensity: stored.gridDensity ?? 'small'
				};
			}
			ready = true;
		})();
	}
	return initPromise;
}

export async function updatePreferences(patch: Partial<Preferences>): Promise<void> {
	preferences = { ...preferences, ...patch };
	// idb-keyval structured-clones the value for IndexedDB, which throws on
	// the Proxy that $state wraps objects in — persist a plain snapshot instead.
	await set(STORAGE_KEY, $state.snapshot(preferences));
}

export function isPostHidden(postId: string): boolean {
	return preferences.hiddenPostIds.includes(postId);
}

export async function hidePost(postId: string): Promise<void> {
	if (preferences.hiddenPostIds.includes(postId)) return;
	await updatePreferences({ hiddenPostIds: [...preferences.hiddenPostIds, postId] });
}

export async function unhidePost(postId: string): Promise<void> {
	await updatePreferences({ hiddenPostIds: preferences.hiddenPostIds.filter((id) => id !== postId) });
}

export function isCommentHidden(commentId: string): boolean {
	return preferences.hiddenCommentIds.includes(commentId);
}

/** Hides a comment locally — this browser only, not a network action. The
 *  comment itself is untouched; anyone else, including its author, still
 *  sees it exactly as published. */
export async function hideComment(commentId: string): Promise<void> {
	if (preferences.hiddenCommentIds.includes(commentId)) return;
	await updatePreferences({ hiddenCommentIds: [...preferences.hiddenCommentIds, commentId] });
}

export async function unhideComment(commentId: string): Promise<void> {
	await updatePreferences({ hiddenCommentIds: preferences.hiddenCommentIds.filter((id) => id !== commentId) });
}

export function isAuthorBlocked(authorPubkey: string): boolean {
	return preferences.blockedAuthors.includes(authorPubkey);
}

/** Blocks an author locally — their posts stop showing up in Browse for this
 *  browser only (see nostr/browse.ts). Not a network action: the author
 *  isn't notified and can still publish; nothing prevents them from being
 *  unblocked and reappearing later. */
export async function blockAuthor(authorPubkey: string): Promise<void> {
	if (preferences.blockedAuthors.includes(authorPubkey)) return;
	await updatePreferences({ blockedAuthors: [...preferences.blockedAuthors, authorPubkey] });
}

export async function unblockAuthor(authorPubkey: string): Promise<void> {
	await updatePreferences({ blockedAuthors: preferences.blockedAuthors.filter((pub) => pub !== authorPubkey) });
}

export function isTagBlocked(tag: string): boolean {
	return preferences.blockedTags.includes(tag);
}

export async function blockTag(tag: string): Promise<void> {
	if (preferences.blockedTags.includes(tag)) return;
	await updatePreferences({ blockedTags: [...preferences.blockedTags, tag] });
}

export async function unblockTag(tag: string): Promise<void> {
	await updatePreferences({ blockedTags: preferences.blockedTags.filter((t) => t !== tag) });
}

/** Test-only escape hatch: sets preferences directly, bypassing the
 *  IndexedDB-backed persistence in updatePreferences (unavailable under
 *  plain Node/vitest). */
export function __setPreferencesForTests(patch: Partial<Preferences>): void {
	preferences = { ...preferences, ...patch };
}
