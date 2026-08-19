<script lang="ts">
	import type { Comment } from '$lib/types';
	import type { PostId, PubKey } from '$lib/types';
	import { postComment, deleteComment } from '$lib/nostr/comments';
	import { getCurrentUser } from '$lib/state/auth.svelte';
	import CommentComposer from './CommentComposer.svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from 'svelte-sonner';

	let {
		comments: initialComments,
		postId,
		postAuthor
	}: { comments: Comment[]; postId: PostId; postAuthor: PubKey } = $props();

	let comments = $state([...initialComments]);
	let replyingTo = $state<string | null>(null);

	const roots = $derived(
		comments.filter((c) => c.parent_id === null).sort((a, b) => a.created_at - b.created_at)
	);
	function repliesTo(rootId: string): Comment[] {
		return comments.filter((c) => c.parent_id === rootId).sort((a, b) => a.created_at - b.created_at);
	}

	async function postTop(content: string) {
		const comment = await postComment(postId, postAuthor, content);
		comments = [...comments, comment];
	}

	async function postReply(rootId: string, content: string) {
		const comment = await postComment(postId, postAuthor, content, rootId);
		comments = [...comments, comment];
		replyingTo = null;
	}

	async function remove(id: string) {
		try {
			const updated = await deleteComment(id);
			comments = comments.map((c) => (c.id === id ? updated : c));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to delete comment.');
		}
	}

	function shortPubkey(pubkey: string): string {
		return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
	}
</script>

{#snippet commentRow(comment: Comment, isReply: boolean)}
	<div class="flex flex-col gap-1 {isReply ? 'ml-6 border-l border-border pl-3' : ''}">
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<span class="font-medium text-foreground">{shortPubkey(comment.author)}</span>
			{#if comment.author === postAuthor}
				<span class="rounded bg-primary/15 px-1 py-0.5 text-[10px] font-semibold text-primary uppercase">Author</span>
			{/if}
			<span>{new Date(comment.created_at).toLocaleString()}</span>
		</div>
		{#if comment.deleted}
			<p class="text-sm text-muted-foreground italic">Deletion requested.</p>
		{:else}
			<p class="text-sm whitespace-pre-wrap">{comment.content}</p>
		{/if}
		<div class="flex gap-2">
			{#if !isReply && !comment.deleted}
				<button
					type="button"
					class="text-xs text-muted-foreground hover:text-foreground"
					onclick={() => (replyingTo = replyingTo === comment.id ? null : comment.id)}
				>
					Reply
				</button>
			{/if}
			{#if comment.author === getCurrentUser() && !comment.deleted}
				<Button variant="link" size="sm" class="h-auto p-0 text-xs text-destructive" onclick={() => remove(comment.id)}>
					Delete
				</Button>
			{/if}
		</div>
		{#if replyingTo === comment.id}
			<div class="mt-1">
				<CommentComposer placeholder="Write a reply…" onSubmit={(content) => postReply(comment.id, content)} />
			</div>
		{/if}
	</div>
{/snippet}

<div class="flex flex-col gap-5">
	<CommentComposer onSubmit={postTop} />

	{#each roots as root (root.id)}
		<div class="flex flex-col gap-3">
			{@render commentRow(root, false)}
			{#each repliesTo(root.id) as reply (reply.id)}
				{@render commentRow(reply, true)}
			{/each}
		</div>
	{/each}

	{#if roots.length === 0}
		<p class="text-sm text-muted-foreground">No comments yet.</p>
	{/if}
</div>
