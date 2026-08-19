<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import PostCard from './PostCard.svelte';
	import type { Post } from '$lib/types';

	function samplePost(overrides: Partial<Post> = {}): Post {
		return {
			id: 'npub1demoauthor00000000000000000000000000000000000000000000:demo-uuid',
			author: 'npub1demoauthor00000000000000000000000000000000000000000000',
			version: 1,
			content: 'A sample caption',
			images: [{ url: 'https://picsum.photos/seed/openbooru/600/600' }],
			tags: ['outdoors', 'artist:hoge'],
			rating: 'general',
			created_at: Date.now(),
			updated_at: Date.now(),
			deleted: false,
			deleted_at: null,
			...overrides
		};
	}

	const { Story } = defineMeta({
		title: 'Components/PostCard',
		component: PostCard,
		tags: ['autodocs']
	});
</script>

<Story name="General" args={{ post: samplePost(), score: 5 }} />
<Story name="Sensitive" args={{ post: samplePost({ rating: 'sensitive' }), score: 12 }} />
<Story name="Explicit" args={{ post: samplePost({ rating: 'explicit' }), score: -2 }} />
<Story name="No votes yet" args={{ post: samplePost(), score: 0 }} />
