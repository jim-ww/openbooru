import { error } from '@sveltejs/kit';
import { getPost } from '$lib/nostr/posts';
import { getCurrentUser } from '$lib/state/auth.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const result = await getPost(params.id);
	if (!result.ok) error(404, 'Post not found');
	if (result.doc.author !== getCurrentUser()) error(403, 'Only the author can edit this post.');
	return { post: result.doc };
};
