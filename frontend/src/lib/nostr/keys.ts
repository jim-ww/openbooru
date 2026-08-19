import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex } from 'nostr-tools/utils';
import type { Keyring } from '$lib/types';

/** Generates a new Nostr (secp256k1) identity. There is no recovery mechanism
 *  — losing the returned secret key means losing this identity permanently. */
export function generateKeyring(): Keyring {
	const secretKey = generateSecretKey();
	const publicKey = getPublicKey(secretKey);
	return { publicKey, secretKey: bytesToHex(secretKey) };
}
