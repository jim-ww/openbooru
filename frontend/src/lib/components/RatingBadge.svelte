<script lang="ts">
	import type { Rating } from '$lib/types';
	import { RATING_BADGE_CLASSES, RATING_LABELS } from '$lib/ratingStyle';

	let { rating, class: className = '' }: { rating: Rating; class?: string } = $props();
</script>

<span
	class="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide {RATING_BADGE_CLASSES[
		rating
	]} {className}"
>
	{RATING_LABELS[rating]}
</span>
