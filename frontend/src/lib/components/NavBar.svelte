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
	<div class="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
		<a href={resolve('/')} class="flex shrink-0 items-center gap-2 font-bold tracking-tight">
			<span class="text-primary">open</span><span>booru</span>
		</a>

		<nav class="hidden shrink-0 items-center gap-1 sm:flex">
			<Button href={resolve('/')} variant="ghost" size="sm" class="gap-1.5">
				<House class="size-4" />
				Home
			</Button>
			<Button href={resolve('/upload')} variant="ghost" size="sm" class="gap-1.5">
				<ImagePlus class="size-4" />
				Upload
			</Button>
		</nav>

		<SearchInput bind:value={query} onsubmit={submitSearch} placeholder="Search tags…" class="min-w-0 flex-1" />

		<div class="flex shrink-0 items-center gap-1">
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
	</div>
</header>
