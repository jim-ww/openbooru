import { searchPosts } from '$lib/nostr/browse';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	// Not awaited — see routes/+page.ts.
	return { query, posts: query.trim() ? searchPosts(query) : Promise.resolve([]) };
};
