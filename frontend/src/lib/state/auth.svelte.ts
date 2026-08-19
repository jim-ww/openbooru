import type { Keyring, PubKey } from '$lib/types';
import { generateKeyring } from '$lib/nostr/keys';
import { loadKeyring, saveKeyring, loadRegistered, saveRegistered } from '$lib/db/keyring';

let keyring = $state<Keyring | null>(null);
let ready = $state(false);
let registered = $state(false);
let initPromise: Promise<void> | null = null;

export function getCurrentUser(): PubKey | null {
	return keyring?.publicKey ?? null;
}

export function getKeyring(): Keyring | null {
	return keyring;
}

export function isAuthReady(): boolean {
	return ready;
}

/** Whether this browser has an account registered with the network (a
 *  published profile), as opposed to a guest who only has a local identity
 *  used for signing local-only content. Actions that write to the network —
 *  publishing posts, comments — require this. */
export function isAccountRegistered(): boolean {
	return registered;
}

/** Marks this browser as having a registered account and persists it. Call
 *  after successfully publishing an initial profile. */
export async function markRegistered(): Promise<void> {
	registered = true;
	await saveRegistered(true);
}

/** Throws unless this browser has a registered account — guard for any
 *  network-write action (publishing posts/comments). */
export function requireAccount(): void {
	if (!registered) throw new Error('Create an account to do this.');
}

/** Switches this browser to a different account (see identity/backup.ts) —
 *  persists it as the new local identity, replacing whatever was here.
 *  Resets the registered flag; callers restoring a backup of an already-
 *  registered account should call markRegistered() afterward. */
export async function setKeyring(next: Keyring): Promise<void> {
	await saveKeyring(next);
	keyring = next;
	registered = false;
	await saveRegistered(false);
	ready = true;
}

/** Logs out of the current account by replacing this browser's identity with
 *  a freshly generated one, as a guest. There is no key recovery, so callers
 *  must have already warned the user to back up their account first. */
export async function logout(): Promise<void> {
	const generated = generateKeyring();
	await saveKeyring(generated);
	keyring = generated;
	registered = false;
	await saveRegistered(false);
}

/** Test-only escape hatch: sets the keyring directly, bypassing IndexedDB
 *  (unavailable under plain Node/vitest). Also marks the account registered,
 *  since most tests exercising a keyring are exercising publish/write paths
 *  that now require it. */
export function __setKeyringForTests(k: Keyring | null): void {
	keyring = k;
	ready = k !== null;
	registered = k !== null;
}

/** Test-only escape hatch: flips the registered flag without touching
 *  IndexedDB, so tests can simulate a guest (has a keyring, no account). */
export function __setRegisteredForTests(value: boolean): void {
	registered = value;
}

/** Loads the identity from IndexedDB, or generates and persists a new one on
 *  first run (there is no key recovery — this is the only copy). Generating
 *  a keypair is purely local and never touches the network — only
 *  registering an account does. Safe to call multiple times; the underlying
 *  load/generate only happens once. */
export function initAuth(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			const existing = await loadKeyring();
			if (existing) {
				keyring = existing;
			} else {
				const generated = generateKeyring();
				await saveKeyring(generated);
				keyring = generated;
			}
			registered = (await loadRegistered()) ?? false;
			ready = true;
		})();
	}
	return initPromise;
}
