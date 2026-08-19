import { browseNetworkPage } from '$lib/nostr/browse';

// Not awaited: relay round-trips can take several seconds (or the query
// timeout, on an unreachable relay), and a client-side `load()` blocks
// navigation until it resolves. Returning the promise itself lets the page
// render its shell immediately and stream the result in via `{#await}`,
// rather than leaving the whole route blank until the network settles.
export function load() {
	return { feed: browseNetworkPage(null, 30) };
}
