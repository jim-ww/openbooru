<script lang="ts">
	import type { PageData } from './$types';
	import type { Post } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PostGrid from '$lib/components/PostGrid.svelte';
	import PostGridSkeleton from '$lib/components/PostGridSkeleton.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import { getScoresForPosts, type Score } from '$lib/nostr/reactions';
	import { recordSeenTags } from '$lib/tags';

	let { data }: { data: PageData } = $props();

	let query = $state(data.query);
	let posts = $state<Post[]>([]);
	let scores = $state<Map<string, Score>>(new Map());
	let loaded = $state(false);

	$effect(() => {
		query = data.query;
	});

	$effect(() => {
		loaded = false;
		data.posts.then((p) => {
			posts = p;
			loaded = true;
			void getScoresForPosts(p.map((post) => post.id)).then((s) => (scores = s));
			for (const post of p) void recordSeenTags(post.tags);
		});
	});

	function submit(trimmed: string) {
		void goto(resolve('/search') + `?q=${encodeURIComponent(trimmed)}`);
	}
</script>

<svelte:head><title>Search — openbooru</title></svelte:head>

<div class="mx-auto max-w-7xl px-4 py-6">
	<SearchInput bind:value={query} onsubmit={submit} placeholder="e.g. outdoors -indoors rating:general" class="mb-2" />
	<p class="mb-4 text-xs text-muted-foreground">
		The simplest way to search is to just click a tag anywhere in the site — this box is for combining several at once.
		Space-separated tags are combined with AND. Use <code>-tag</code> to exclude,
		<code>rating:general|sensitive|explicit</code>
		to filter by rating, and <code>order:score|new</code> to sort.
	</p>

	{#if !data.query.trim()}
		<p class="py-16 text-center text-sm text-muted-foreground">Enter a search above, or click any tag to browse it directly.</p>
	{:else if !loaded}
		<PostGridSkeleton />
	{:else}
		<PostGrid {posts} {scores} />
	{/if}
</div>
