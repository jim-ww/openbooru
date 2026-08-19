<script lang="ts">
	import { resolve } from '$app/paths';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button';
	import { getPreferences, updatePreferences, isPreferencesReady } from '$lib/state/preferences.svelte';
	import { getCurrentUser } from '$lib/state/auth.svelte';

	const preferences = $derived(getPreferences());
	const visible = $derived(isPreferencesReady() && !preferences.backupReminderDismissed && getCurrentUser() !== null);

	function dismiss() {
		void updatePreferences({ backupReminderDismissed: true });
	}
</script>

{#if visible}
	<div class="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
		<div class="mx-auto flex max-w-7xl items-center gap-3">
			<KeyRound class="size-4 shrink-0" />
			<p class="min-w-0 flex-1">
				openbooru has no username or password — your account is a secret key stored only in this browser. Back it up
				now, or you could lose access for good.
			</p>
			<Button href={resolve('/settings')} size="sm" variant="outline" class="shrink-0 border-amber-500/40">
				Back up my key
			</Button>
			<button
				type="button"
				onclick={dismiss}
				aria-label="Dismiss"
				class="shrink-0 rounded p-1 opacity-70 hover:opacity-100"
			>
				<X class="size-4" />
			</button>
		</div>
	</div>
{/if}
