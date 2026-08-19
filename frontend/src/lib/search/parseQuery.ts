import { isRating, type Rating } from '$lib/types';

export type SortOrder = 'new' | 'score';

/** A parsed Danbooru/Gelbooru-style tag search query: space-separated tags
 *  are AND'd, `-tag` excludes, and `rating:`/`order:` are meta-tags rather
 *  than literal searchable tags. Everything else is treated as a plain
 *  include tag, lowercased to match how tags are stored/searched. */
export interface ParsedQuery {
	includeTags: string[];
	excludeTags: string[];
	rating: Rating | null;
	order: SortOrder | null;
}

export function parseSearchQuery(query: string): ParsedQuery {
	const includeTags: string[] = [];
	const excludeTags: string[] = [];
	let rating: Rating | null = null;
	let order: SortOrder | null = null;

	for (const rawToken of query.trim().split(/\s+/)) {
		if (!rawToken) continue;
		const token = rawToken.toLowerCase();

		if (token.startsWith('rating:')) {
			const value = token.slice('rating:'.length);
			if (isRating(value)) rating = value;
			continue;
		}
		if (token.startsWith('order:')) {
			const value = token.slice('order:'.length);
			if (value === 'new' || value === 'score') order = value;
			continue;
		}
		if (token.startsWith('-') && token.length > 1) {
			excludeTags.push(token.slice(1));
			continue;
		}
		includeTags.push(token);
	}

	return { includeTags, excludeTags, rating, order };
}
