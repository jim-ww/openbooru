import { nip19 } from 'nostr-tools';
import { getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type { Keyring, User } from '$lib/types';

/** Plain-JSON export of a keyring, versioned so future format changes don't
 *  break old exports. Framed to users as "back up / use an existing
 *  account" rather than "export your private key" — same thing, less
 *  alarming wording, still calls out the risk.
 *
 *  The secret key is carried as a NIP-19 `nsec` — the standard, portable
 *  Nostr backup encoding (any client that understands `nsec1...` can parse
 *  this back into a usable keypair).
 *
 *  Carries the profile fields too (not just the key) so restoring on a
 *  fresh browser shows the right username/avatar immediately, without
 *  depending on a relay still having (and serving) that pubkey's profile. */
interface AccountBackupV1 {
	version: 1;
	nsec: string;
	username?: string;
	description?: string;
	image_url?: string;
}

export interface AccountBackup {
	keyring: Keyring;
	profileFields?: { username: string; description: string; image_url?: string };
}

export function exportAccountBackup(keyring: Keyring, profile?: User | null): string {
	const backup: AccountBackupV1 = {
		version: 1,
		nsec: nip19.nsecEncode(hexToBytes(keyring.secretKey)),
		...(profile
			? {
					username: profile.username,
					description: profile.description,
					...(profile.image_url ? { image_url: profile.image_url } : {})
				}
			: {})
	};
	return JSON.stringify(backup, null, 2);
}

/** Accepts either a full `AccountBackupV1` JSON export, or a bare `nsec1...`
 *  string pasted directly (e.g. from another Nostr client's export) — both
 *  decode to the same result, since the JSON wrapper only adds profile
 *  fields on top of the same nsec. */
export function parseAccountBackup(input: string): AccountBackup {
	const trimmed = input.trim();
	if (nip19.NostrTypeGuard.isNSec(trimmed)) {
		return { keyring: keyringFromNsec(trimmed) };
	}

	let data: unknown;
	try {
		data = JSON.parse(input);
	} catch {
		throw new Error("That doesn't look like a valid backup file.");
	}
	const d = data as Partial<AccountBackupV1> | null;
	if (!d || typeof d.nsec !== 'string') {
		throw new Error('Unrecognized backup format.');
	}
	return {
		keyring: keyringFromNsec(d.nsec),
		...(typeof d.username === 'string' && typeof d.description === 'string'
			? { profileFields: { username: d.username, description: d.description, ...(d.image_url ? { image_url: d.image_url } : {}) } }
			: {})
	};
}

function keyringFromNsec(nsec: string): Keyring {
	const decoded = nip19.decode(nsec);
	if (decoded.type !== 'nsec') {
		throw new Error('Unrecognized backup format.');
	}
	const secretKeyBytes = decoded.data;
	return { publicKey: getPublicKey(secretKeyBytes), secretKey: bytesToHex(secretKeyBytes) };
}
