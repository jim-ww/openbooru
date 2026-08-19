<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { canonicalUrl } from '$lib/seo';

	let {
		title,
		description,
		noindex = false
	}: {
		title: string;
		description?: string;
		noindex?: boolean;
	} = $props();

	const canonical = $derived(canonicalUrl(page.url.pathname));

	// app.html ships strong static defaults for these (see its comment) so a
	// non-JS crawler still gets a real title/description — those live outside
	// Svelte's control, so a route with something more specific to say
	// updates them in place here instead of declaring a second, duplicate
	// <meta>/<link> alongside the static one.
	$effect(() => {
		if (!browser) return;
		if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
		document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
		document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
		document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical);
		document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
		if (description) {
			document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
			document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
		}
	});
</script>

<svelte:head>
	<title>{title}</title>
	{#if noindex}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>
