<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import X from '@lucide/svelte/icons/x';

	let { items = $bindable([]), placeholder = '' }: { items: string[]; placeholder?: string } = $props();

	let draft = $state('');

	function add() {
		const value = draft.trim();
		if (!value || items.includes(value)) {
			draft = '';
			return;
		}
		items = [...items, value];
		draft = '';
	}

	function remove(value: string) {
		items = items.filter((i) => i !== value);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			add();
		}
	}
</script>

<div class="flex flex-col gap-2">
	{#if items.length > 0}
		<ul class="flex flex-col gap-1">
			{#each items as item (item)}
				<li class="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-sm">
					<span class="truncate font-mono text-xs">{item}</span>
					<button type="button" onclick={() => remove(item)} class="shrink-0 text-muted-foreground hover:text-destructive">
						<X class="size-3.5" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="flex gap-2">
		<Input bind:value={draft} {placeholder} onkeydown={onKeydown} class="font-mono text-xs" />
		<Button variant="outline" size="sm" onclick={add}>Add</Button>
	</div>
</div>
