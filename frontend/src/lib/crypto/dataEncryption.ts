import { get as idbGet, set as idbSet, del as idbDel, createStore, promisifyRequest } from 'idb-keyval';

/** Optional passphrase-based at-rest encryption for every idb-keyval store
 *  this app writes to. Off by default (existing installs keep working
 *  unencrypted); enabling it derives a random Data Encryption Key (DEK),
 *  wraps it with a passphrase-derived key (PBKDF2 -> AES-GCM "KEK"), and
 *  re-encrypts every known store's current contents in place.
 *
 *  The wrapped-DEK envelope itself (this module's META_KEY) is never
 *  encrypted — it has to be readable before a passphrase is even entered,
 *  since it's what tells the rest of the app "encryption is on, go prompt
 *  for a passphrase" before anything else loads. See db/*.ts, which all
 *  import `get`/`set`/`del` from here instead of directly from idb-keyval. */

const META_KEY = 'openbooru:encryption-meta';

/** Every store key this app persists via idb-keyval, kept in one place so
 *  enabling/disabling encryption can migrate all of them without each
 *  db/*.ts module having to register itself. Add new stores here too. */
const ALL_STORE_KEYS = [
	'openbooru:keyring',
	'openbooru:account-registered',
	'openbooru:comment-delete-requests',
	'openbooru:own-profile',
	'openbooru:preferences',
	'openbooru:tag-index'
] as const;

const PBKDF2_ITERATIONS = 250_000;

// idb-keyval's own default store ('keyval-store' db, 'keyval' object store —
// see its source), reached directly here (rather than through its exported
// get/set/del) so enable/disableEncryption can batch every store key's
// migrated value together with the meta envelope's put/delete into a single
// IndexedDB transaction. That's what actually makes the migration atomic:
// a transaction either commits in full or has no effect at all, even across
// a crash or killed process mid-write — one call to idb-keyval's set() per
// key would leave a window where some keys are migrated and others aren't.
const defaultStore = createStore('keyval-store', 'keyval');

function atomicWrite(puts: [string, unknown][], deletes: string[] = []): Promise<void> {
	return defaultStore('readwrite', (store) => {
		for (const [key, value] of puts) store.put(value, key);
		for (const key of deletes) store.delete(key);
		return promisifyRequest(store.transaction);
	});
}

interface EncryptionMeta {
	version: 1;
	salt: string; // base64, for KEK derivation
	iterations: number;
	wrapIv: string; // base64, iv used to wrap the DEK
	wrappedDek: string; // base64, AES-GCM(KEK, wrapIv, raw DEK bytes)
}

interface Envelope {
	iv: string; // base64
	data: string; // base64
}

let dek: CryptoKey | null = null;

// Spreading a whole large byte array as individual arguments to
// String.fromCharCode blows the call stack past a few tens of thousands of
// bytes (same trap as Math.max(...hugeArray)). Chunking the spread keeps
// each call comfortably under any engine's argument-count limit.
const TO_B64_CHUNK_SIZE = 0x8000;

function toB64(bytes: ArrayBuffer): string {
	const arr = new Uint8Array(bytes);
	let binary = '';
	for (let i = 0; i < arr.length; i += TO_B64_CHUNK_SIZE) {
		binary += String.fromCharCode(...arr.subarray(i, i + TO_B64_CHUNK_SIZE));
	}
	return btoa(binary);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
	const binary = atob(b64);
	const bytes = new Uint8Array(new ArrayBuffer(binary.length));
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function deriveKek(
	passphrase: string,
	salt: Uint8Array<ArrayBuffer>,
	iterations: number
): Promise<CryptoKey> {
	const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
		'deriveKey'
	]);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
		baseKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

function loadMeta(): Promise<EncryptionMeta | undefined> {
	return idbGet<EncryptionMeta>(META_KEY);
}

/** Whether encryption has been set up on this browser (not the same as
 *  whether it's currently unlocked — see {@link isUnlocked}). */
export async function isEncryptionEnabled(): Promise<boolean> {
	return (await loadMeta()) !== undefined;
}

export function isUnlocked(): boolean {
	return dek !== null;
}

async function encryptValue(value: unknown): Promise<Envelope> {
	if (!dek) throw new Error('Data is locked — call unlock() first');
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plaintext = new TextEncoder().encode(JSON.stringify(value));
	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, plaintext);
	return { iv: toB64(iv.buffer), data: toB64(ciphertext) };
}

async function decryptValue<T>(envelope: Envelope): Promise<T> {
	if (!dek) throw new Error('Data is locked — call unlock() first');
	const iv = fromB64(envelope.iv);
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, fromB64(envelope.data));
	return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/** Drop-in replacement for idb-keyval's `get` — transparently decrypts when
 *  encryption is enabled and unlocked, passes through plaintext otherwise
 *  (matching every db/*.ts caller's existing behavior). */
export async function get<T>(key: string): Promise<T | undefined> {
	const raw = await idbGet<Envelope | T>(key);
	if (raw === undefined) return undefined;
	if (!(await isEncryptionEnabled())) return raw as T;
	return decryptValue<T>(raw as Envelope);
}

/** Drop-in replacement for idb-keyval's `set`. */
export async function set(key: string, value: unknown): Promise<void> {
	if (await isEncryptionEnabled()) {
		await idbSet(key, await encryptValue(value));
	} else {
		await idbSet(key, value);
	}
}

/** Drop-in replacement for idb-keyval's `del` — deletion needs no key. */
export function del(key: string): Promise<void> {
	return idbDel(key);
}

/** Unlocks previously-enabled encryption for this session. Throws if the
 *  passphrase is wrong (the AES-GCM auth tag on the wrapped DEK fails to
 *  verify) or if encryption was never enabled. */
export async function unlock(passphrase: string): Promise<void> {
	const meta = await loadMeta();
	if (!meta) throw new Error('Encryption is not enabled');
	const kek = await deriveKek(passphrase, fromB64(meta.salt), meta.iterations);
	let rawDek: ArrayBuffer;
	try {
		rawDek = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(meta.wrapIv) }, kek, fromB64(meta.wrappedDek));
	} catch {
		throw new Error('Incorrect passphrase');
	}
	// Extractable so changePassphrase() can re-export it to rewrap under a
	// new KEK without needing to decrypt and re-encrypt every store.
	dek = await crypto.subtle.importKey('raw', rawDek, 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export function lock(): void {
	dek = null;
}

/** Enables encryption: generates a fresh DEK, wraps it with a key derived
 *  from `passphrase`, then re-encrypts every known store's current
 *  plaintext contents in place. No-op-safe to call only once — throws if
 *  already enabled (disable first to change the scheme from scratch; use
 *  {@link changePassphrase} to just rotate the passphrase). */
export async function enableEncryption(passphrase: string): Promise<void> {
	if (await isEncryptionEnabled()) throw new Error('Encryption is already enabled');

	const newDek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
	const rawDek = await crypto.subtle.exportKey('raw', newDek);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iterations = PBKDF2_ITERATIONS;
	const kek = await deriveKek(passphrase, salt, iterations);
	const wrapIv = crypto.getRandomValues(new Uint8Array(12));
	const wrappedDek = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, rawDek);

	dek = newDek;

	// Encrypt every existing store's current plaintext contents, then commit
	// them together with the meta envelope in one atomic transaction (see
	// atomicWrite) — so a crash or kill mid-migration either leaves
	// everything plaintext (as if enableEncryption was never called) or
	// everything encrypted with meta in place to unlock it, never a mix of
	// ciphertext stores with no meta to ever decrypt them again.
	const puts: [string, unknown][] = [];
	for (const key of ALL_STORE_KEYS) {
		const plaintext = await idbGet(key);
		if (plaintext === undefined) continue;
		puts.push([key, await encryptValue(plaintext)]);
	}

	const meta: EncryptionMeta = {
		version: 1,
		salt: toB64(salt.buffer),
		iterations,
		wrapIv: toB64(wrapIv.buffer),
		wrappedDek: toB64(wrappedDek)
	};
	puts.push([META_KEY, meta]);
	await atomicWrite(puts);
}

/** Disables encryption: verifies `passphrase`, decrypts every store back to
 *  plaintext, then removes the meta envelope — all in one atomic transaction
 *  (see atomicWrite/enableEncryption), so a crash or kill mid-migration
 *  can't leave some stores decrypted while meta (and get()/set()'s
 *  ciphertext expectation) still says encryption is on, which would
 *  otherwise brick the app on next launch even with the right passphrase. */
export async function disableEncryption(passphrase: string): Promise<void> {
	await unlock(passphrase); // throws on wrong passphrase, also sets `dek`

	const puts: [string, unknown][] = [];
	for (const key of ALL_STORE_KEYS) {
		const envelope = await idbGet<Envelope>(key);
		if (envelope === undefined) continue;
		puts.push([key, await decryptValue(envelope)]);
	}
	await atomicWrite(puts, [META_KEY]);
	dek = null;
}

/** Rotates the passphrase without touching any encrypted data — only the
 *  DEK's wrapping changes. */
export async function changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void> {
	await unlock(oldPassphrase); // throws on wrong passphrase
	const currentDek = dek!;
	const rawDek = await crypto.subtle.exportKey('raw', currentDek);

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iterations = PBKDF2_ITERATIONS;
	const kek = await deriveKek(newPassphrase, salt, iterations);
	const wrapIv = crypto.getRandomValues(new Uint8Array(12));
	const wrappedDek = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wrapIv }, kek, rawDek);

	const meta: EncryptionMeta = {
		version: 1,
		salt: toB64(salt.buffer),
		iterations,
		wrapIv: toB64(wrapIv.buffer),
		wrappedDek: toB64(wrappedDek)
	};
	await idbSet(META_KEY, meta);
}
