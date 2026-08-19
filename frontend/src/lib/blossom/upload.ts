import { bytesToHex } from 'nostr-tools/utils';
import type { EventTemplate } from 'nostr-tools';
import type { Keyring } from '$lib/types';
import type { PostImage } from '$lib/types';
import { signEvent } from '$lib/nostr/sign';
import { BLOSSOM_AUTH_KIND } from '$lib/nostr/kinds';

/** BUD-02 "Blob Descriptor" — what a Blossom server's `/upload` response
 *  body looks like. */
export interface BlossomBlob {
	url: string;
	sha256: string;
	size: number;
	type?: string;
	uploaded: number; // unix seconds
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data);
	return bytesToHex(new Uint8Array(digest));
}

/** btoa() only accepts Latin1 — safe here since the auth event's own content
 *  is an ASCII string this module generates, but encoding through UTF-8
 *  bytes first keeps this correct even if that ever changes. */
function toBase64(str: string): string {
	const bytes = new TextEncoder().encode(str);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** Builds the `Authorization: Nostr <base64 event>` header BUD-02 requires:
 *  a signed kind-24242 event scoped to this specific blob (`x` = its
 *  sha256) and action (`t`), with a short expiration so a captured header
 *  can't be replayed indefinitely. */
async function buildAuthHeader(sha256: string, keyring: Keyring, verb: 'upload' | 'delete'): Promise<string> {
	const template: EventTemplate = {
		kind: BLOSSOM_AUTH_KIND,
		tags: [
			['t', verb],
			['x', sha256],
			['expiration', String(Math.floor(Date.now() / 1000) + 60)]
		],
		content: `Authorize ${verb} of ${sha256}`,
		created_at: Math.floor(Date.now() / 1000)
	};
	const event = signEvent(template, keyring);
	return `Nostr ${toBase64(JSON.stringify(event))}`;
}

export interface BlossomUploadResult {
	blob: BlossomBlob;
	server: string;
}

/** Uploads `file` to the first server in `servers` that accepts it (BUD-01/
 *  BUD-02), trying each in order. Throws the last server's error only after
 *  every configured server has failed. */
export async function uploadToBlossom(file: File | Blob, servers: string[], keyring: Keyring): Promise<BlossomUploadResult> {
	if (servers.length === 0) throw new Error('No Blossom server configured.');

	const buffer = await file.arrayBuffer();
	const sha256 = await sha256Hex(buffer);
	const auth = await buildAuthHeader(sha256, keyring, 'upload');
	const contentType = file.type || 'application/octet-stream';

	let lastError: unknown;
	for (const server of servers) {
		try {
			const res = await fetch(`${server.replace(/\/+$/, '')}/upload`, {
				method: 'PUT',
				headers: { 'Content-Type': contentType, Authorization: auth },
				body: file
			});
			if (!res.ok) {
				throw new Error(`Blossom server rejected the upload: ${res.status} ${res.statusText}`);
			}
			const blob = (await res.json()) as BlossomBlob;
			return { blob, server };
		} catch (err) {
			lastError = err;
			console.warn(`[blossom] upload to ${server} failed, trying next server`, err);
		}
	}
	throw lastError instanceof Error ? lastError : new Error('Upload failed on every configured Blossom server.');
}

/** Converts an uploaded blob descriptor into the `imeta`-ready shape a post
 *  stores. */
export function blobToPostImage(blob: BlossomBlob): PostImage {
	return {
		url: blob.url,
		sha256: blob.sha256,
		...(blob.type ? { mime: blob.type } : {})
	};
}

/** For the "no Blossom server / all failed" fallback path — a user-pasted
 *  external URL, carrying no sha256/mime since it wasn't uploaded through
 *  this app. */
export function postImageFromUrl(url: string): PostImage {
	return { url };
}
