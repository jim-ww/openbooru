import { describe, it, expect } from 'vitest';
import { generateKeyring } from './keys';
import { signEvent, verifySignedEvent } from './sign';

function template() {
	return { kind: 1, tags: [], content: 'hello world', created_at: Math.floor(Date.now() / 1000) };
}

describe('signEvent / verifySignedEvent', () => {
	it('verifies an event signed with the matching key', () => {
		const keyring = generateKeyring();
		const event = signEvent(template(), keyring);

		expect(verifySignedEvent(event)).toBe(true);
		expect(event.pubkey).toBe(keyring.publicKey);
	});

	it('rejects a tampered event', () => {
		const keyring = generateKeyring();
		const event = signEvent(template(), keyring);

		// Round-trip through JSON first, like a real event received from a relay
		// — nostr-tools caches its verify result on a symbol property that a
		// plain object spread would otherwise carry over from the original.
		const tampered = { ...JSON.parse(JSON.stringify(event)), content: 'mallory' };
		expect(verifySignedEvent(tampered)).toBe(false);
	});

	it('produces a different pubkey for a different key', () => {
		const keyring = generateKeyring();
		const other = generateKeyring();

		expect(keyring.publicKey).not.toBe(other.publicKey);
		const event = signEvent(template(), other);
		expect(event.pubkey).not.toBe(keyring.publicKey);
	});
});
