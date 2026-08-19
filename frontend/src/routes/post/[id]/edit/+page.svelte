<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PostForm from '$lib/components/PostForm.svelte';
	import type { Post } from '$lib/types';

	let { data }: { data: PageData } = $props();

	function handlePublish(post: Post) {
		void goto(resolve('/post/[id]', { id: post.id }));
	}
</script>

<svelte:head><title>Edit post — openbooru</title></svelte:head>

<div class="mx-auto max-w-2xl px-4 py-6">
	<h1 class="mb-1 text-xl font-bold">Edit post</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		Comments and votes stay attached — editing publishes a new revision of the same post, it doesn't create a new one.
	</p>
	<PostForm existing={data.post} onPublish={handlePublish} />
</div>
