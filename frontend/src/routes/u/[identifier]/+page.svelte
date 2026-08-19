<script lang="ts">
	import type { PageData } from './$types';
	import type { Post, User, Verified } from '$lib/types';
	import { nip19 } from 'nostr-tools';
	import PostGrid from '$lib/components/PostGrid.svelte';
	import PostGridSkeleton from '$lib/components/PostGridSkeleton.svelte';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { getScoresForPosts, type Score } from '$lib/nostr/reactions';
	import SeoHead from '$lib/components/SeoHead.svelte';

	let { data }: { data: PageData } = $props();

	let profile = $state<Verified<User> | null>(null);
	let posts = $state<Post[]>([]);
	let scores = $state<Map<string, Score>>(new Map());
	let postsLoaded = $state(false);

	const displayName = $derived(profile?.ok ? profile.doc.username || null : null);
	const npub = $derived(nip19.npubEncode(data.pubkey));

	$effect(() => {
		void data.profile.then((p) => (profile = p));
		postsLoaded = false;
		data.posts.then((p) => {
			posts = p;
			postsLoaded = true;
			void getScoresForPosts(p.map((post) => post.id)).then((s) => (scores = s));
		});
	});
</script>

<SeoHead
	title="{displayName ?? npub} — openbooru"
	description="Posts by {displayName ?? npub} on openbooru, a decentralized Danbooru/Gelbooru-style imageboard."
/>

<div class="mx-auto max-w-7xl px-4 py-6">
	<div class="mb-6 flex items-center gap-4">
		{#if profile === null}
			<Skeleton class="size-16 rounded-full" />
			<Skeleton class="h-6 w-48" />
		{:else}
			<Avatar class="size-16">
				{#if profile.ok && profile.doc.image_url}
					<AvatarImage src={profile.doc.image_url} alt={displayName ?? ''} />
				{/if}
				<AvatarFallback>{(displayName ?? data.pubkey).slice(0, 2).toUpperCase()}</AvatarFallback>
			</Avatar>
			<div>
				<h1 class="text-xl font-bold">{displayName ?? `${data.pubkey.slice(0, 8)}…${data.pubkey.slice(-4)}`}</h1>
				<p class="font-mono text-xs text-muted-foreground">{npub}</p>
				{#if profile.ok && profile.doc.description}
					<p class="mt-1 max-w-prose text-sm">{profile.doc.description}</p>
				{/if}
			</div>
		{/if}
	</div>

	{#if !postsLoaded}
		<PostGridSkeleton />
	{:else}
		<PostGrid {posts} {scores} />
	{/if}
</div>
