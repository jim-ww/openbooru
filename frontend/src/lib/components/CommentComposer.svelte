<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { MAX_COMMENT_LENGTH } from '$lib/types';
	import { getCurrentUser, isAccountRegistered } from '$lib/state/auth.svelte';
	import { toast } from 'svelte-sonner';

	let {
		placeholder = 'Write a comment…',
		onSubmit
	}: { placeholder?: string; onSubmit: (content: string) => Promise<void> } = $props();

	let content = $state('');
	let busy = $state(false);

	async function submit() {
		const trimmed = content.trim();
		if (!trimmed || busy) return;
		if (!getCurrentUser() || !isAccountRegistered()) {
			toast.error('Create an account in Settings to comment.');
			return;
		}
		busy = true;
		try {
			await onSubmit(trimmed);
			content = '';
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to post comment.');
		} finally {
			busy = false;
		}
	}
</script>

<div class="flex flex-col gap-2">
	<Textarea bind:value={content} {placeholder} maxlength={MAX_COMMENT_LENGTH} rows={3} />
	<div class="flex items-center justify-between">
		<span class="text-xs text-muted-foreground">{content.length}/{MAX_COMMENT_LENGTH}</span>
		<Button onclick={submit} disabled={busy || !content.trim()} size="sm">Post</Button>
	</div>
</div>
