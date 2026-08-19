<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PostForm from '$lib/components/PostForm.svelte';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import type { Post } from '$lib/types';

	function handlePublish(post: Post) {
		void goto(resolve('/post/[id]', { id: post.id }));
	}
</script>

<SeoHead
	title="Upload — openbooru"
	description="Post an image to openbooru: tag it, rate it, and it's live — no account approval, no waiting."
	noindex
/>

<div class="mx-auto max-w-2xl px-4 py-6">
	<h1 class="mb-6 text-xl font-bold">Upload</h1>
	<PostForm onPublish={handlePublish} />
</div>
