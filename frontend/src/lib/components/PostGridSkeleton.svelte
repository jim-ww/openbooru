<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	let { count = 18 }: { count?: number } = $props();
</script>

<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
	{#each Array(count) as _, i (i)}
		<Skeleton class="aspect-square rounded-md" />
	{/each}
</div>
