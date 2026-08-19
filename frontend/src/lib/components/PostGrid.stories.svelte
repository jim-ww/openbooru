<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PostGrid from './PostGrid.svelte';
	import type { Post } from '$lib/types';

	function samplePost(id: string, overrides: Partial<Post> = {}): Post {
		return {
			id,
			author: 'npub1demoauthor00000000000000000000000000000000000000000000',
			version: 1,
			content: '',
			images: [{ url: `https://picsum.photos/seed/${id}/600/600` }],
			tags: ['outdoors'],
			rating: 'general',
			created_at: Date.now(),
			updated_at: Date.now(),
			deleted: false,
			deleted_at: null,
			...overrides
		};
	}

	const posts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => samplePost(`demo:${id}`));
	const scores = new Map(posts.map((p, i) => [p.id, { score: i * 3 - 5 }]));

	const { Story } = defineMeta({
		title: 'Components/PostGrid',
		component: PostGrid,
		tags: ['autodocs'],
		parameters: { layout: 'fullscreen' }
	});
</script>

<Story name="Grid of posts" args={{ posts, scores }} />
<Story name="Empty" args={{ posts: [] }} />
