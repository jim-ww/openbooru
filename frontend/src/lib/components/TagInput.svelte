<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { suggestTags } from '$lib/tags';
	import X from '@lucide/svelte/icons/x';

	let { tags = $bindable([]) }: { tags: string[] } = $props();

	let draft = $state('');
	let suggestions = $state<{ tag: string; count: number }[]>([]);

	function normalize(raw: string): string {
		return raw.trim().toLowerCase().replace(/\s+/g, '_');
	}

	function addTag(raw: string) {
		const tag = normalize(raw);
		if (!tag || tags.includes(tag)) {
			draft = '';
			suggestions = [];
			return;
		}
		tags = [...tags, tag];
		draft = '';
		suggestions = [];
	}

	function removeTag(tag: string) {
		tags = tags.filter((t) => t !== tag);
	}

	function onInput() {
		void suggestTags(normalize(draft)).then((s) => (suggestions = s.filter((sug) => !tags.includes(sug.tag))));
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addTag(draft);
		} else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
			removeTag(tags[tags.length - 1]);
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex flex-wrap gap-1.5">
		{#each tags as tag (tag)}
			<span class="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-xs">
				{tag}
				<button type="button" onclick={() => removeTag(tag)} aria-label="Remove tag {tag}">
					<X class="size-3" />
				</button>
			</span>
		{/each}
	</div>
	<div class="relative">
		<Input
			bind:value={draft}
			oninput={onInput}
			onkeydown={onKeydown}
			placeholder="Add a tag and press Enter (artist:name, character:name…)"
		/>
		{#if suggestions.length > 0}
			<ul class="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
				{#each suggestions as s (s.tag)}
					<li>
						<button
							type="button"
							class="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-accent"
							onclick={() => addTag(s.tag)}
						>
							<span>{s.tag}</span>
							<span class="text-xs text-muted-foreground">~{s.count} seen</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
