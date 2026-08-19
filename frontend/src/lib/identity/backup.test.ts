import { describe, it, expect } from 'vitest';
import { exportAccountBackup, parseAccountBackup } from './backup';
import { generateKeyring } from '../nostr/keys';

describe('exportAccountBackup / parseAccountBackup', () => {
	it('round-trips a keyring with no profile through the JSON export', () => {
		const keyring = generateKeyring();
		const backup = exportAccountBackup(keyring);
		const parsed = parseAccountBackup(backup);

		expect(parsed.keyring).toEqual(keyring);
		expect(parsed.profileFields).toBeUndefined();
	});

	it('round-trips profile fields alongside the key', () => {
		const keyring = generateKeyring();
		const profileFields = { username: 'someone', description: 'bio text', image_url: 'https://example.com/avatar.png' };
		const profile = {
			id: keyring.publicKey,
			...profileFields,
			created_at: 0,
			updated_at: 0,
			deleted: false,
			deleted_at: null
		};
		const backup = exportAccountBackup(keyring, profile);
		const parsed = parseAccountBackup(backup);

		expect(parsed.keyring).toEqual(keyring);
		expect(parsed.profileFields).toEqual(profileFields);
	});

	it('accepts a bare nsec1... string, not just the JSON wrapper', () => {
		const keyring = generateKeyring();
		const backup = exportAccountBackup(keyring);
		const nsec = (JSON.parse(backup) as { nsec: string }).nsec;

		const parsed = parseAccountBackup(nsec);
		expect(parsed.keyring).toEqual(keyring);
		expect(parsed.profileFields).toBeUndefined();
	});

	it('rejects input that is neither an nsec nor JSON', () => {
		expect(() => parseAccountBackup('not a key or json')).toThrow("doesn't look like a valid backup");
	});

	it('rejects JSON missing the nsec field', () => {
		expect(() => parseAccountBackup(JSON.stringify({ version: 1 }))).toThrow('Unrecognized backup format.');
	});

	it('rejects an nsec-shaped string with a decode error', () => {
		expect(() => parseAccountBackup('nsec1notarealkeyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toThrow();
	});

	it('trims surrounding whitespace on a pasted nsec', () => {
		const keyring = generateKeyring();
		const backup = exportAccountBackup(keyring);
		const nsec = (JSON.parse(backup) as { nsec: string }).nsec;

		const parsed = parseAccountBackup(`  ${nsec}  \n`);
		expect(parsed.keyring).toEqual(keyring);
	});
});
