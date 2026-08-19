import { finalizeEvent, verifyEvent } from 'nostr-tools/pure';
import { hexToBytes } from 'nostr-tools/utils';
import type { EventTemplate, Event as NostrEvent } from 'nostr-tools';
import type { Keyring } from '$lib/types';

/** Signs an unsigned event template (kind/tags/content/created_at) with this
 *  keyring's secret key, returning the fully-formed, signed Nostr event.
 *  Signing/hashing follows the fixed NIP-01 serialization — no app-level
 *  canonicalization step is needed. */
export function signEvent(template: EventTemplate, keyring: Keyring): NostrEvent {
	return finalizeEvent(template, hexToBytes(keyring.secretKey));
}

/** Verifies an event's signature against its own embedded pubkey and id.
 *  Unlike a caller-supplied-pubkey verification scheme, the pubkey isn't
 *  supplied by the caller — it's part of the signed event itself. Callers
 *  that need to check a *specific* author should also compare
 *  `event.pubkey` themselves. */
export function verifySignedEvent(event: NostrEvent): boolean {
	try {
		return verifyEvent(event);
	} catch {
		return false;
	}
}
