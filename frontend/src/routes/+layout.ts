import { initAuth } from '$lib/state/auth.svelte';
import { initPreferences } from '$lib/state/preferences.svelte';

// A fully client-driven app (Nostr identity, relay data) has nothing
// meaningful to prerender — adapter-static's `fallback: '200.html'` (see
// vite.config.ts) instead ships one SPA shell that boots client-side for
// every route, so SSR is off entirely rather than attempted at build time.
export const ssr = false;

/** Preferences (and thus the user's configured `nostrRelays`/
 *  `blossomServers`) must be loaded from IndexedDB *before* anything can
 *  call a network function, or an early network call would race the load
 *  and briefly fall back to the built-in defaults. Gating this in `load()`
 *  — rather than in `+layout.svelte`'s `onMount` — is what actually closes
 *  the race: Svelte mounts child components (including deep-linked pages)
 *  before a parent layout's own `onMount` runs, so sequencing only at the
 *  component level isn't sufficient. */
export async function load(): Promise<void> {
	await Promise.all([initAuth(), initPreferences()]);
}
