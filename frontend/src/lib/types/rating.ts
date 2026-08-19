/** Danbooru/Gelbooru-style content rating, stored as the post's `rating` tag.
 *  `explicit` also carries a NIP-36 `content-warning` tag for interop with
 *  other Nostr clients. */
export type Rating = 'general' | 'sensitive' | 'explicit';

export const RATINGS: readonly Rating[] = ['general', 'sensitive', 'explicit'];

export function isRating(value: string): value is Rating {
	return (RATINGS as readonly string[]).includes(value);
}
