import type { Tombstonable } from './signed';

/** A Nostr (secp256k1) public key, hex-encoded per NIP-01. Doubles as the
 *  canonical identifier for both users and posts — there is no separate
 *  UUID for identity. */
export type PubKey = string;

export interface UserFields {
	id: PubKey;
	username: string; // required, can be empty
	description: string; // required, can be empty
	image_url?: string;
}

/** The full document as it's signed, published, and validated. Unlike Post/
 *  Comment, there's no separate `author` field — `id` already is the
 *  signer's pubkey. */
export type User = UserFields &
	Tombstonable & {
		created_at: number; // unix ms
		updated_at: number; // unix ms
	};

/** Fields the current user's client alone has access to. Never published to
 *  any relay. `secretKey` is the raw secp256k1 secret key, hex-encoded, used
 *  to sign every event this identity publishes. */
export interface Keyring {
	publicKey: PubKey;
	secretKey: string; // hex-encoded, stored in IndexedDB only, never published
}
