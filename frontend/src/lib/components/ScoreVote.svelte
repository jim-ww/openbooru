<script lang="ts">
	import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
	import ThumbsDown from '@lucide/svelte/icons/thumbs-down';
	import { Button } from '$lib/components/ui/button';
	import { vote, type LikeTarget, type VoteDirection } from '$lib/nostr/reactions';
	import { getCurrentUser, isAccountRegistered } from '$lib/state/auth.svelte';
	import { toast } from 'svelte-sonner';

	let {
		target,
		score: initialScore,
		ownVote: initialOwnVote = null
	}: { target: LikeTarget; score: number; ownVote?: VoteDirection | null } = $props();

	let score = $state(initialScore);
	let ownVote = $state<VoteDirection | null>(initialOwnVote);
	let busy = $state(false);

	async function cast(direction: VoteDirection) {
		if (busy) return;
		if (!getCurrentUser() || !isAccountRegistered()) {
			toast.error('Create an account in Settings to vote.');
			return;
		}
		busy = true;
		const previousScore = score;
		const previousVote = ownVote;
		// Optimistic update — the network call below is best-effort/eventual.
		if (ownVote === direction) {
			score += direction === '+' ? -1 : 1;
			ownVote = null;
		} else {
			score += direction === '+' ? 1 : -1;
			if (ownVote) score += ownVote === '+' ? -1 : 1;
			ownVote = direction;
		}
		try {
			const result = await vote(target, direction);
			ownVote = result;
		} catch (err) {
			score = previousScore;
			ownVote = previousVote;
			toast.error(err instanceof Error ? err.message : 'Failed to vote.');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex items-center gap-0.5">
	<Button
		onclick={() => cast('+')}
		variant="ghost"
		size="icon"
		class="size-7 {ownVote === '+' ? 'text-primary' : ''}"
		aria-label="Upvote"
		disabled={busy}
	>
		<ThumbsUp class="size-3.5" />
	</Button>
	<span class="min-w-6 text-center text-sm font-medium tabular-nums">{score}</span>
	<Button
		onclick={() => cast('-')}
		variant="ghost"
		size="icon"
		class="size-7 {ownVote === '-' ? 'text-destructive' : ''}"
		aria-label="Downvote"
		disabled={busy}
	>
		<ThumbsDown class="size-3.5" />
	</Button>
</div>
