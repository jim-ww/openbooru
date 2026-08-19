<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import RatingBadge from '$lib/components/RatingBadge.svelte';
	import ScoreVote from '$lib/components/ScoreVote.svelte';
	import TagSidebar from '$lib/components/TagSidebar.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import CommentThread from '$lib/components/CommentThread.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { deletePost, undeletePost } from '$lib/nostr/posts';
	import { getCurrentUser } from '$lib/state/auth.svelte';
	import { relatedTags, recordSeenTags, tagLabel } from '$lib/tags';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import { toast } from 'svelte-sonner';
	import Trash from '@lucide/svelte/icons/trash-2';
	import Pencil from '@lucide/svelte/icons/pencil';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import type { Comment } from '$lib/types';
	import type { VoteDirection } from '$lib/nostr/reactions';

	let { data }: { data: PageData } = $props();

	let post = $state(data.post);
	let activeImage = $state(0);
	let related = $state<{ tag: string; count: number }[]>([]);

	// Comments/score/vote stream in separately from the post itself (see
	// routes/post/[id]/+page.ts) rather than blocking the whole page on
	// them.
	let comments = $state<Comment[] | null>(null);
	let score = $state(0);
	let ownVote = $state<VoteDirection | null>(null);
	// ScoreVote seeds its own local state from these props only once, at
	// mount — so it must not mount until the real values have arrived,
	// otherwise it would freeze on the placeholder 0/null forever.
	let scoreLoaded = $state(false);

	$effect(() => {
		void data.comments.then((c) => (comments = c));
		void Promise.all([data.score, data.ownVote]).then(([s, v]) => {
			score = s.score;
			ownVote = v;
			scoreLoaded = true;
		});
	});

	$effect(() => {
		void recordSeenTags(post.tags);
		void Promise.all(post.tags.map((t) => relatedTags(t))).then((lists) => {
			const merged = new Map<string, number>();
			for (const list of lists) for (const { tag, count } of list) {
				if (post.tags.includes(tag)) continue;
				merged.set(tag, (merged.get(tag) ?? 0) + count);
			}
			related = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count }));
		});
	});

	function formatBytes(bytes?: number): string | null {
		if (!bytes) return null;
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function handleDelete() {
		if (!confirm('Request deletion of this post? This is best-effort — relays may or may not honor it.')) return;
		try {
			await deletePost(post.id);
			toast.success('Deletion requested.');
			void goto(resolve('/'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to delete post.');
		}
	}

	let restoring = $state(false);
	async function handleUndelete() {
		restoring = true;
		try {
			post = await undeletePost(post);
			toast.success('Post restored.');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to restore post.');
		} finally {
			restoring = false;
		}
	}
</script>

<SeoHead
	title={post.tags.length ? `${post.tags.slice(0, 3).map(tagLabel).join(', ')} — openbooru` : 'Post — openbooru'}
	description={`A ${post.rating} post on openbooru${post.tags.length ? `, tagged ${post.tags.slice(0, 8).map(tagLabel).join(', ')}` : ''}.`}
/>

<div class="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[1fr_280px]">
	<div class="flex flex-col gap-3">
		<div class="overflow-hidden rounded-lg bg-muted">
			{#if post.images[activeImage]}
				<img src={post.images[activeImage].url} alt={post.content || 'Post image'} class="max-h-[80vh] w-full object-contain" />
			{/if}
		</div>
		{#if post.images.length > 1}
			<div class="flex gap-2 overflow-x-auto">
				{#each post.images as image, i (image.url)}
					<button
						type="button"
						onclick={() => (activeImage = i)}
						class="size-16 shrink-0 overflow-hidden rounded border-2 {i === activeImage ? 'border-primary' : 'border-transparent'}"
					>
						<img src={image.url} alt="" class="size-full object-cover" />
					</button>
				{/each}
			</div>
		{/if}

		{#if post.content}
			<p class="text-sm whitespace-pre-wrap">{post.content}</p>
		{/if}

		{#if post.deleted}
			<div class="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
				<span>Deletion requested by the author. Relays that honor it will stop serving this post.</span>
				{#if post.author === getCurrentUser()}
					<Button variant="outline" size="sm" onclick={handleUndelete} disabled={restoring} class="shrink-0 gap-1.5">
						<RotateCcw class="size-3.5" />
						{restoring ? 'Restoring…' : 'Undo'}
					</Button>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-3">
			{#if scoreLoaded}
				<ScoreVote target={{ type: 'post', id: post.id }} {score} {ownVote} />
			{:else}
				<span class="text-sm text-muted-foreground">…</span>
			{/if}
			<RatingBadge rating={post.rating} />
			<a href={resolve('/u/[identifier]', { identifier: post.author })} class="text-sm text-muted-foreground hover:text-foreground">
				{post.author.slice(0, 8)}…{post.author.slice(-4)}
			</a>
			{#if post.version > 1}
				<span class="text-xs text-muted-foreground">edited</span>
			{/if}
			{#if post.author === getCurrentUser()}
				<div class="ml-auto flex gap-1">
					<Button href={resolve('/post/[id]/edit', { id: post.id })} variant="ghost" size="icon" aria-label="Edit post">
						<Pencil class="size-4" />
					</Button>
					{#if !post.deleted}
						<Button variant="ghost" size="icon" class="text-destructive" onclick={handleDelete} aria-label="Delete post">
							<Trash class="size-4" />
						</Button>
					{/if}
				</div>
			{/if}
		</div>

		<Separator />

		{#if comments !== null}
			<CommentThread {comments} postId={post.id} />
		{:else}
			<p class="text-sm text-muted-foreground">Loading comments…</p>
		{/if}
	</div>

	<aside class="flex flex-col gap-6">
		<div>
			<h2 class="mb-2 text-sm font-semibold">Tags</h2>
			<TagSidebar tags={post.tags} />
		</div>

		{#if related.length > 0}
			<div>
				<h2 class="mb-2 text-sm font-semibold">Related tags</h2>
				<div class="flex flex-wrap gap-1">
					{#each related as r (r.tag)}
						<TagChip tag={r.tag} count={r.count} />
					{/each}
				</div>
			</div>
		{/if}

		<div>
			<h2 class="mb-2 text-sm font-semibold">Info</h2>
			<dl class="flex flex-col gap-1 text-xs text-muted-foreground">
				{#if post.images[activeImage]?.dim}
					<div class="flex justify-between"><dt>Dimensions</dt><dd>{post.images[activeImage].dim}</dd></div>
				{/if}
				{#if formatBytes(post.images[activeImage]?.size)}
					<div class="flex justify-between"><dt>Size</dt><dd>{formatBytes(post.images[activeImage].size)}</dd></div>
				{/if}
				{#if post.images[activeImage]?.mime}
					<div class="flex justify-between"><dt>Type</dt><dd>{post.images[activeImage].mime}</dd></div>
				{/if}
				<div class="flex justify-between"><dt>Posted</dt><dd>{new Date(post.created_at).toLocaleDateString()}</dd></div>
			</dl>
		</div>
	</aside>
</div>
