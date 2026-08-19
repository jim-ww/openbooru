<script lang="ts">
	import type { PageData } from './$types';
	import type { Post } from '$lib/types';
	import PostGrid from '$lib/components/PostGrid.svelte';
	import PostGridSkeleton from '$lib/components/PostGridSkeleton.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { getScoresForPosts, type Score } from '$lib/nostr/reactions';
	import { relatedTags, recordSeenTags, tagLabel } from '$lib/tags';
	import SeoHead from '$lib/components/SeoHead.svelte';

	let { data }: { data: PageData } = $props();

	let posts = $state<Post[]>([]);
	let scores = $state<Map<string, Score>>(new Map());
	let related = $state<{ tag: string; count: number }[]>([]);
	let loaded = $state(false);

	$effect(() => {
		loaded = false;
		data.posts.then((p) => {
			posts = p;
			loaded = true;
			void getScoresForPosts(p.map((post) => post.id)).then((s) => (scores = s));
			for (const post of p) void recordSeenTags(post.tags);
		});
		void relatedTags(data.tag).then((r) => (related = r));
	});
</script>

<SeoHead
	title="#{tagLabel(data.tag)} — openbooru"
	description="Browse posts tagged #{tagLabel(data.tag)} on openbooru, a decentralized Danbooru/Gelbooru-style imageboard."
/>

<div class="mx-auto max-w-7xl px-4 py-6">
	<h1 class="mb-1 text-xl font-bold">#{tagLabel(data.tag)}</h1>
	{#if loaded}
		<p class="mb-4 text-sm text-muted-foreground">{posts.length} post{posts.length === 1 ? '' : 's'}</p>
	{/if}

	{#if related.length > 0}
		<div class="mb-4 flex flex-wrap gap-1.5">
			{#each related as r (r.tag)}
				<TagChip tag={r.tag} count={r.count} />
			{/each}
		</div>
	{/if}

	{#if !loaded}
		<PostGridSkeleton />
	{:else}
		<PostGrid {posts} {scores} />
	{/if}
</div>
