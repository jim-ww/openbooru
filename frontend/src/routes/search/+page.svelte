<script lang="ts">
	import type { PageData } from './$types';
	import type { Post } from '$lib/types';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PostGrid from '$lib/components/PostGrid.svelte';
	import PostGridSkeleton from '$lib/components/PostGridSkeleton.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
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

	function submit(event: SubmitEvent) {
		event.preventDefault();
		void goto(resolve('/search') + `?q=${encodeURIComponent(query.trim())}`);
	}
</script>

<svelte:head><title>Search — openbooru</title></svelte:head>

<div class="mx-auto max-w-7xl px-4 py-6">
	<form onsubmit={submit} class="mb-2 flex gap-2">
		<Input bind:value={query} placeholder="tags, -exclude, rating:general, order:score" />
		<Button type="submit">Search</Button>
	</form>
	<p class="mb-4 text-xs text-muted-foreground">
		Space-separated tags are combined with AND. Use <code>-tag</code> to exclude,
		<code>rating:general|sensitive|explicit</code>
		to filter by rating, and <code>order:score|new</code> to sort.
	</p>

	{#if !data.query.trim()}
		<p class="py-16 text-center text-sm text-muted-foreground">Enter a search above to get started.</p>
	{:else if !loaded}
		<PostGridSkeleton />
	{:else}
		<PostGrid {posts} {scores} />
	{/if}
</div>
