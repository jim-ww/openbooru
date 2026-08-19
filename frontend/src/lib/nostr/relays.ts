/** Sensible default relays, overridable via Settings. Also used as the
 *  bootstrap set for resolving anyone's NIP-65 relay list in the first
 *  place — you need at least one relay to discover where to look for
 *  someone's own declared relays, so these are deliberately large,
 *  well-known, high-uptime public relays rather than anything niche —
 *  every fresh install needs to reach *some* of these on the very first
 *  run, before the user has configured anything. There's no dynamic
 *  "best relay" discovery service to bootstrap from — a small hardcoded
 *  set of well-known relays is the normal, expected approach here. */
export const DEFAULT_NOSTR_RELAYS: string[] = [
	'wss://nos.lol',
	'wss://relay.primal.net',
	'wss://relay.snort.social',
	'wss://nostr.mom'
];
