import type { PostId, PubKey } from '$lib/types';
import { POST_KIND } from './kinds';

/** Mints a fresh id for a post authored by `author`, as an opaque
 *  `"{author}:{uuid}"` string — the `uuid` half becomes this post's stable
 *  NIP-33 `d` tag (its identity, which must never change even when the post
 *  is edited), while `author` is a hex Nostr pubkey. */
export function makePostId(author: PubKey): PostId {
	return `${author}:${crypto.randomUUID()}`;
}

export function parsePostId(id: PostId): { author: PubKey; uuid: string } {
	const separator = id.indexOf(':');
	if (separator < 0) throw new Error(`Malformed post id: ${id}`);
	return { author: id.slice(0, separator), uuid: id.slice(separator + 1) };
}

/** The NIP-33 addressable-event coordinate (`kind:pubkey:d`) for `id` — used
 *  wherever another event needs to reference this post (comments,
 *  reactions). */
export function postCoordinate(id: PostId): string {
	const { author, uuid } = parsePostId(id);
	return `${POST_KIND}:${author}:${uuid}`;
}

/** Inverse of postCoordinate — recovers the app-facing PostId from a
 *  `kind:pubkey:d` coordinate string (e.g. from an `a` tag). */
export function parsePostCoordinate(coordinate: string): PostId {
	const [, author, uuid] = coordinate.split(':');
	return `${author}:${uuid}`;
}
