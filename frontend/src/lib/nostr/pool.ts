import { SimplePool } from 'nostr-tools/pool';
import { browser } from '$app/environment';
import type { PubKey } from '$lib/types';
import { getActiveRelays } from '$lib/state/preferences.svelte';

let instance: SimplePool | null = null;

/** Lazily creates the singleton relay pool. There is no "login"/auth step —
 *  publishing to a relay just means signing an event and sending it; any
 *  relay will accept a validly-signed event from any pubkey (relay-side
 *  write policies aside). */
export function getPool(): SimplePool {
	if (!browser) {
		throw new Error('Nostr pool is browser-only');
	}
	if (!instance) {
		instance = new SimplePool();
	}
	return instance;
}

/** How long a "none of these relays are reachable" result is trusted before
 *  re-attempting a real connection. Without this, a caller that checks
 *  connectivity once per item pays the full connect timeout on every single
 *  item even though the relay set hasn't changed and was already known to
 *  be unreachable — turning an offline operation into an O(N) wait instead
 *  of O(1). */
const CONNECTIVITY_CACHE_MS = 10000;

let connectivityCache: { relaysKey: string; connected: boolean; checkedAt: number } | null = null;

/** Resolves once at least one relay in `relays` has connected, or after
 *  `timeoutMs`, whichever comes first — so a cold-started reader can give
 *  the WebSocket handshake a moment to finish before issuing a query,
 *  instead of racing it and coming back empty. Returns whether a relay was
 *  actually reached, so callers can skip further network calls entirely
 *  when nothing is reachable rather than attempting them anyway. */
export async function poolConnected(relays: string[] = getActiveRelays(), timeoutMs = 1500): Promise<boolean> {
	const relaysKey = [...relays].sort().join(',');
	if (
		connectivityCache &&
		connectivityCache.relaysKey === relaysKey &&
		Date.now() - connectivityCache.checkedAt < CONNECTIVITY_CACHE_MS
	) {
		return connectivityCache.connected;
	}
	const pool = getPool();
	const connected = await Promise.race([
		Promise.any(relays.map((url) => pool.ensureRelay(url).then(() => true))).catch(() => false),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs))
	]);
	connectivityCache = { relaysKey, connected, checkedAt: Date.now() };
	return connected;
}

/** How long a relay that just failed to connect is skipped before being
 *  retried. Per-relay (unlike CONNECTIVITY_CACHE_MS's whole-set verdict
 *  above) — a single dead relay in an otherwise-healthy set must not gate
 *  whether the others get queried at all. */
const RELAY_FAILURE_CACHE_MS = 30000;

/** How long to give a not-yet-known-bad relay to connect when probing it —
 *  matches nostr-tools' own default per-relay connect timeout
 *  (maxWaitForConnection), since there's no point being more patient here
 *  than SimplePool itself would be. */
const RELAY_PROBE_TIMEOUT_MS = 3000;

const relayFailedAt = new Map<string, number>();

/** Narrows `relays` down to ones not already known-dead, connecting to any
 *  not-yet-checked ones to find out. Without this, `SimplePool.querySync`
 *  (which waits for *every* relay in the list to settle, connected or not,
 *  before resolving) pays a truly-unreachable relay's full connect timeout
 *  on every single call before the relays that actually work even get a
 *  chance to answer, which on a slower/higher-latency connection can burn
 *  through the whole overall query budget before anything real comes back.
 *  Never returns an empty list even if every relay is currently marked
 *  dead — better to actually try than to silently query nothing (mirrors
 *  why poolConnected's result must never gate queryEvents either, see its
 *  call site). */
export async function filterReachableRelays(relays: string[]): Promise<string[]> {
	const now = Date.now();
	const uncheckedOrStale = relays.filter((url) => {
		const failedAt = relayFailedAt.get(url);
		return failedAt === undefined || now - failedAt >= RELAY_FAILURE_CACHE_MS;
	});
	const knownDead = relays.filter((url) => !uncheckedOrStale.includes(url));
	if (uncheckedOrStale.length === 0) return relays;
	const pool = getPool();
	const probed = await Promise.all(
		uncheckedOrStale.map(async (url) => {
			try {
				await Promise.race([
					pool.ensureRelay(url),
					new Promise((_, reject) => setTimeout(() => reject(new Error('probe timed out')), RELAY_PROBE_TIMEOUT_MS))
				]);
				relayFailedAt.delete(url);
				return url;
			} catch {
				relayFailedAt.set(url, now);
				return null;
			}
		})
	);
	const reachable = [...probed.filter((url): url is string => url !== null)];
	if (reachable.length === 0 && knownDead.length === relays.length) {
		// Everything's marked dead (or just failed re-probing) — try the
		// full original set rather than querying nothing at all, in case
		// they're all actually back up and the cache is just stale.
		return relays;
	}
	return reachable;
}

/** In-memory cache of each author's declared NIP-65 relay list (kind 10002),
 *  keyed by pubkey — avoids re-querying it on every single author-scoped
 *  lookup. Session-scoped only; no persistence. Populated/consumed by the
 *  outbox-model resolution helpers (see nostr/relayList.ts). */
const relayListCache = new Map<string, { read: string[]; write: string[] }>();

export function getCachedRelayList(pubkey: PubKey): { read: string[]; write: string[] } | undefined {
	return relayListCache.get(pubkey);
}

export function setCachedRelayList(pubkey: PubKey, relays: { read: string[]; write: string[] }): void {
	relayListCache.set(pubkey, relays);
}

/** Test-only escape hatch: overrides the singleton so tests can use a fake
 *  pool instead of production's real-WebSocket SimplePool. */
export function __setPoolForTests(pool: SimplePool | null): void {
	instance = pool;
	relayListCache.clear();
	connectivityCache = null;
	relayFailedAt.clear();
}
