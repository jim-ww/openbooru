import { resolveAuthorIdentifier } from '$lib/nostr/usernames';
import { getProfile } from '$lib/nostr/profile';
import { listPostsByAuthor } from '$lib/nostr/posts';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const pubkey = await resolveAuthorIdentifier(params.identifier);
	// Not awaited — see routes/+page.ts.
	return { pubkey, profile: getProfile(pubkey), posts: listPostsByAuthor(pubkey) };
};
