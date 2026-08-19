import type { Signed, Tombstonable } from './signed';
import type { Rating } from './rating';

/** `"{authorPubkey}:{uuid}"` — encodes the author so any holder of an id can
 *  locate the post via a relay-native authors+d-tag filter (see
 *  nostr/posts.ts) without a separate global lookup index. Opaque to
 *  everything outside nostr/posts.ts — routes, comments, etc. just pass
 *  this string around. */
export type PostId = string;

export interface PostImage {
	url: string;
	sha256?: string;
	mime?: string;
	dim?: string; // "WIDTHxHEIGHT"
	size?: number; // bytes
	fallbackUrls?: string[];
}

export interface PostFields {
	id: PostId;
	version: number; // increments on every edit snapshot
	content: string; // caption/description
	images: PostImage[]; // at least one
	tags: string[]; // booru tags, flat with an optional "namespace:value" convention
	rating: Rating;
}

/** The full document as it's signed, published, and validated. */
export type Post = PostFields & Signed & Tombstonable;

/** Input shape for the upload/edit form — no id/version/signature/
 *  timestamps yet, those get filled in by lib/nostr/posts.ts on publish. */
export type PostDraft = Omit<PostFields, 'id' | 'version'> & {
	id?: PostId; // absent = creating new, present = editing
};
