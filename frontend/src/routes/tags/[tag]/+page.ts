import { browseByTag } from '$lib/nostr/browse';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	// Not awaited — see routes/+page.ts.
	return { tag: params.tag, posts: browseByTag(params.tag) };
};
