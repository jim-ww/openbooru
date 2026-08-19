import type { PubKey } from './user';

/** Anything published to a relay and authenticated by a signature carries these.
 *  Compose with `& Signed` rather than duplicating these fields per type. */
export interface Signed {
	author: PubKey;
	created_at: number;
	updated_at: number;
}

/** Documents that support soft-delete via a new signed snapshot or a local
 *  tombstone record, rather than being removed from the graph. */
export interface Tombstonable {
	deleted: boolean;
	deleted_at: number | null;
}

/** Result of verifying an incoming document against its claimed signature/schema.
 *  Anything that fails is dropped by the caller — never partially trusted. */
export type Verified<T> =
	| { ok: true; doc: T }
	| { ok: false; reason: 'bad_signature' | 'invalid_schema' | 'unknown_version' };
