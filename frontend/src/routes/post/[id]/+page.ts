import { error } from '@sveltejs/kit';
import { getPost } from '$lib/nostr/posts';
import { getCommentsForPost } from '$lib/nostr/comments';
import { getScore, getOwnVotesForPosts, type LikeTarget } from '$lib/nostr/reactions';
import { getCurrentUser } from '$lib/state/auth.svelte';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	// The post itself is awaited — a 404 has to be known before rendering
	// anything. Comments/score/vote are NOT awaited (see comment in
	// routes/+page.ts) so the image/tags can render immediately while those
	// stream in separately.
	const result = await getPost(params.id);
	if (!result.ok) error(404, 'Post not found');
	const post = result.doc;

	const target: LikeTarget = { type: 'post', id: post.id, author: post.author };
	const pubkey = getCurrentUser();

	return {
		post,
		comments: getCommentsForPost(post.id, post.author),
		score: getScore(target),
		ownVote: pubkey
			? getOwnVotesForPosts([post.id], pubkey).then((votes) => votes.get(post.id) ?? null)
			: Promise.resolve(null)
	};
};
