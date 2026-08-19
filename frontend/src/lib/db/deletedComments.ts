import { get, set } from '$lib/crypto/dataEncryption';
import type { CommentId } from '$lib/types';

/** Comments are immutable Nostr events (NIP-22) — there is no revision to
 *  mark `deleted: true` on. A NIP-09 delete request is only best-effort (a
 *  relay may or may not honor it), so this browser keeps its own record of
 *  "I requested deletion of this comment" and renders it as such locally
 *  regardless of what any given relay actually does with the request. */
const STORE_KEY = 'openbooru:comment-delete-requests';

export async function loadDeleteRequestedMap(): Promise<Record<CommentId, number>> {
	return (await get<Record<CommentId, number>>(STORE_KEY)) ?? {};
}

export async function markCommentDeleteRequested(id: CommentId): Promise<number> {
	const map = await loadDeleteRequestedMap();
	const timestamp = Date.now();
	map[id] = timestamp;
	await set(STORE_KEY, map);
	return timestamp;
}
