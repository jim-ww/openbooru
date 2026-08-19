<script lang="ts">
	import { resolve } from '$app/paths';
	import { tagCategory, tagLabel, TAG_CATEGORY_CLASSES } from '$lib/tags';

	let { tag, count }: { tag: string; count?: number } = $props();
	const category = $derived(tagCategory(tag));
</script>

<a
	href={resolve('/tags/[tag]', { tag })}
	class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors hover:brightness-125 {TAG_CATEGORY_CLASSES[
		category
	]}"
>
	{tagLabel(tag)}
	{#if count !== undefined}
		<span class="text-[10px] opacity-60">{count}</span>
	{/if}
</a>
