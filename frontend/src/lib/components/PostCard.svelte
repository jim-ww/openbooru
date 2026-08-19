<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Post } from '$lib/types';
	import { RATING_BORDER_CLASSES } from '$lib/ratingStyle';
	import Flame from '@lucide/svelte/icons/flame';

	let { post, score = 0 }: { post: Post; score?: number } = $props();
	const cover = $derived(post.images[0]);
</script>

<a
	href={resolve('/post/[id]', { id: post.id })}
	class="group relative block aspect-square overflow-hidden rounded-md bg-muted ring-1 {RATING_BORDER_CLASSES[post.rating]}"
>
	{#if cover}
		<img
			src={cover.url}
			alt={post.content || 'Post image'}
			loading="lazy"
			class="size-full object-cover transition-transform duration-200 group-hover:scale-105"
		/>
	{/if}

	{#if post.rating !== 'general'}
		<span
			class="absolute top-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase"
		>
			{post.rating}
		</span>
	{/if}

	<span
		class="absolute right-1 bottom-1 flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white"
	>
		<Flame class="size-3" />
		{score}
	</span>
</a>
