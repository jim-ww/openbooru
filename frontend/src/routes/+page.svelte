<script lang="ts">
	import type { PageData } from './$types';
	import type { Post } from '$lib/types';
	import PostGrid from '$lib/components/PostGrid.svelte';
	import PostGridSkeleton from '$lib/components/PostGridSkeleton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { getScoresForPosts, type Score } from '$lib/nostr/reactions';
	import { browseNetworkPage, type BrowseCursor } from '$lib/nostr/browse';
	import { recordSeenTags } from '$lib/tags';

	let { data }: { data: PageData } = $props();

	let posts = $state<Post[]>([]);
	let cursor = $state<BrowseCursor | null>(null);
	let scores = $state<Map<string, Score>>(new Map());
	let loaded = $state(false);
	let loadError = $state<string | null>(null);
	let loadingMore = $state(false);

	$effect(() => {
		loaded = false;
		loadError = null;
		data.feed
			.then((result) => {
				posts = result.posts;
				cursor = result.cursor;
				loaded = true;
				void getScoresForPosts(posts.map((p) => p.id)).then((s) => (scores = s));
				for (const post of posts) void recordSeenTags(post.tags);
			})
			.catch((err: unknown) => {
				loadError = err instanceof Error ? err.message : String(err);
				loaded = true;
			});
	});

	async function loadMore() {
		if (!cursor || loadingMore) return;
		loadingMore = true;
		try {
			const result = await browseNetworkPage(cursor, 30);
			posts = [...posts, ...result.posts];
			cursor = result.cursor;
			void getScoresForPosts(posts.map((p) => p.id)).then((s) => (scores = s));
			for (const post of result.posts) void recordSeenTags(post.tags);
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head><title>openbooru</title></svelte:head>

<div class="mx-auto max-w-7xl px-4 py-6">
	{#if !loaded}
		<PostGridSkeleton />
	{:else if loadError}
		<p class="py-16 text-center text-sm text-destructive">Failed to load the feed: {loadError}</p>
	{:else}
		<PostGrid {posts} {scores} />
		{#if cursor}
			<div class="mt-6 flex justify-center">
				<Button onclick={loadMore} disabled={loadingMore} variant="outline">
					{loadingMore ? 'Loading…' : 'Load more'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
