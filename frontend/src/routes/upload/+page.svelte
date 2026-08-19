<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PostForm from '$lib/components/PostForm.svelte';
	import type { Post } from '$lib/types';

	function handlePublish(post: Post) {
		void goto(resolve('/post/[id]', { id: post.id }));
	}
</script>

<svelte:head>
	<title>Upload — openbooru</title>
	<meta name="description" content="Post an image to openbooru: tag it, rate it, and it's live — no account approval, no waiting." />
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<h1 class="mb-6 text-xl font-bold">Upload</h1>
	<PostForm onPublish={handlePublish} />
</div>
