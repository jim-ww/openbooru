import { get, set } from '$lib/crypto/dataEncryption';
import type { PostId } from '$lib/types';

/** Posts (NIP-68 kind 20) are regular, immutable Nostr events — unlike an
 *  addressable/replaceable event, there is no revision to tombstone. A
 *  NIP-09 delete request is only best-effort (a relay may or may not honor
 *  it), so this browser keeps its own record of "I requested deletion of
 *  this post" and renders it as such locally regardless of what any given
 *  relay actually does with the request — same pattern as
 *  db/deletedComments.ts. */
const STORE_KEY = 'openbooru:post-delete-requests';

export async function loadPostDeleteRequestedMap(): Promise<Record<PostId, number>> {
	return (await get<Record<PostId, number>>(STORE_KEY)) ?? {};
}

export async function markPostDeleteRequested(id: PostId): Promise<number> {
	const map = await loadPostDeleteRequestedMap();
	const timestamp = Date.now();
	map[id] = timestamp;
	await set(STORE_KEY, map);
	return timestamp;
}
