<script lang="ts">
	import TagChip from './TagChip.svelte';
	import { tagCategory, TAG_CATEGORY_LABELS, type TagCategory } from '$lib/tags';

	let { tags }: { tags: string[] } = $props();

	const ORDER: TagCategory[] = ['artist', 'copyright', 'character', 'general', 'meta'];

	const grouped = $derived.by(() => {
		const groups = new Map<TagCategory, string[]>();
		for (const tag of tags) {
			const category = tagCategory(tag);
			const list = groups.get(category) ?? [];
			list.push(tag);
			groups.set(category, list);
		}
		return ORDER.map((category) => ({ category, tags: groups.get(category) ?? [] })).filter((g) => g.tags.length > 0);
	});
</script>

<div class="flex flex-col gap-4">
	{#each grouped as group (group.category)}
		<div>
			<h3 class="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				{TAG_CATEGORY_LABELS[group.category]}
			</h3>
			<div class="flex flex-wrap gap-1">
				{#each group.tags as tag (tag)}
					<TagChip {tag} />
				{/each}
			</div>
		</div>
	{/each}
	{#if tags.length === 0}
		<p class="text-sm text-muted-foreground">No tags.</p>
	{/if}
</div>
