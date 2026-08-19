<script lang="ts">
	import type { Post } from '$lib/types';
	import PostCard from './PostCard.svelte';

	let { posts, scores = new Map() }: { posts: Post[]; scores?: Map<string, { score: number }> } = $props();
</script>

{#if posts.length === 0}
	<p class="py-16 text-center text-sm text-muted-foreground">No posts found.</p>
{:else}
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
		{#each posts as post (post.id)}
			<PostCard {post} score={scores.get(post.id)?.score ?? 0} />
		{/each}
	</div>
{/if}
