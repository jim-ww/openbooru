import type { Signed, Tombstonable } from './signed';
import type { Rating } from './rating';

/** A post's own Nostr event id (kind 20 is a regular, immutable event —
 *  unlike an addressable/replaceable event there's no separate stable
 *  coordinate; the event id itself is the identity). */
export type PostId = string;

export interface PostImage {
	url: string;
	sha256?: string;
	mime?: string;
	dim?: string; // "WIDTHxHEIGHT"
	fallbackUrls?: string[];
}

export interface PostFields {
	id: PostId;
	content: string; // caption/description
	images: PostImage[]; // at least one
	tags: string[]; // booru tags, flat with an optional "namespace:value" convention
	rating: Rating;
}

export type Post = PostFields & Signed & Tombstonable;
