<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import House from '@lucide/svelte/icons/house';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import Settings from '@lucide/svelte/icons/settings';
	import Info from '@lucide/svelte/icons/info';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import { getCurrentUser } from '$lib/state/auth.svelte';

	let query = $state('');

	function submitSearch(trimmed: string) {
		if (!trimmed) return;
		void goto(resolve('/search') + `?q=${encodeURIComponent(trimmed)}`);
	}
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
	<div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
		<a href={resolve('/')} class="order-1 flex shrink-0 items-center gap-2 font-bold tracking-tight">
			<span class="text-primary">open</span><span>booru</span>
		</a>

		<nav class="order-2 flex shrink-0 items-center gap-1">
			<Button href={resolve('/')} variant="ghost" size="sm" class="gap-1.5">
				<House class="size-4" />
				<span class="hidden sm:inline">Home</span>
			</Button>
			<Button href={resolve('/upload')} variant="ghost" size="sm" class="gap-1.5">
				<ImagePlus class="size-4" />
				<span class="hidden sm:inline">Upload</span>
			</Button>
		</nav>

		<div class="order-3 ml-auto flex shrink-0 items-center gap-1 sm:order-4 sm:ml-0">
			<Button onclick={toggleMode} variant="ghost" size="icon" aria-label="Toggle theme">
				<Sun class="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
				<Moon class="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
			</Button>
			<Button href={resolve('/about')} variant="ghost" size="icon" aria-label="About">
				<Info class="size-4" />
			</Button>
			<Button href={resolve('/settings')} variant="ghost" size="icon" aria-label="Settings">
				<Settings class="size-4" />
			</Button>
			{#if getCurrentUser()}
				<Button href={resolve('/u/[identifier]', { identifier: getCurrentUser() ?? '' })} variant="outline" size="sm">
					Profile
				</Button>
			{/if}
		</div>

		<SearchInput
			bind:value={query}
			onsubmit={submitSearch}
			placeholder="Search tags…"
			class="order-4 w-full sm:order-3 sm:w-auto sm:min-w-0 sm:flex-1"
		/>
	</div>
</header>
