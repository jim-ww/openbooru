<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';
	import NavBar from '$lib/components/NavBar.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { installWailsConsoleForward } from '$lib/wailsConsoleForward';
	import '../app.css';

	let { children } = $props();

	onMount(() => {
		installWailsConsoleForward();
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<ModeWatcher />
<Toaster />

<div class="flex min-h-screen flex-col">
	<NavBar />
	<main class="flex-1">
		{@render children()}
	</main>
</div>

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}>{locale}</a>
	{/each}
</div>
