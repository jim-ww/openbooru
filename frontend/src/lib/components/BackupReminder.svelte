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
		<div class="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
			<div class="flex min-w-0 flex-1 items-start gap-2">
				<KeyRound class="mt-0.5 size-4 shrink-0" />
				<p>
					openbooru has no username or password — your account is a secret key stored only in this browser. Back it up
					now, or you could lose access for good.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2 self-end sm:self-auto">
				<Button href={resolve('/settings')} size="sm" variant="outline" class="border-amber-500/40">Back up my key</Button>
				<button type="button" onclick={dismiss} aria-label="Dismiss" class="rounded p-1 opacity-70 hover:opacity-100">
					<X class="size-4" />
				</button>
			</div>
		</div>
	</div>
{/if}
