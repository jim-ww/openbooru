import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bytesToHex } from 'nostr-tools/utils';
import { generateKeyring } from '$lib/nostr/keys';
import { verifySignedEvent } from '$lib/nostr/sign';
import { BLOSSOM_AUTH_KIND } from '$lib/nostr/kinds';
import { uploadToBlossom, blobToPostImage, postImageFromUrl, type BlossomBlob } from './upload';

function fakeFile(bytes: number[], type = 'image/png'): File {
	return new File([new Uint8Array(bytes)], 'test.png', { type });
}

async function sha256Hex(bytes: number[]): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
	return bytesToHex(new Uint8Array(digest));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('uploadToBlossom', () => {
	it('throws when no server is configured', async () => {
		await expect(uploadToBlossom(fakeFile([1, 2, 3]), [], generateKeyring())).rejects.toThrow('No Blossom server configured.');
	});

	it('PUTs to /upload with a valid Nostr auth header scoped to the file hash', async () => {
		const keyring = generateKeyring();
		const bytes = [10, 20, 30, 40];
		const expectedHash = await sha256Hex(bytes);

		let capturedAuth = '';
		let capturedUrl = '';
		const blob: BlossomBlob = { url: 'https://blossom.example/x', sha256: expectedHash, size: bytes.length, type: 'image/png', uploaded: 0 };
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init: RequestInit) => {
				capturedUrl = url;
				capturedAuth = (init.headers as Record<string, string>).Authorization;
				return new Response(JSON.stringify(blob), { status: 200 });
			})
		);

		const result = await uploadToBlossom(fakeFile(bytes), ['https://blossom.example'], keyring);

		expect(capturedUrl).toBe('https://blossom.example/upload');
		expect(result.blob).toEqual(blob);
		expect(result.server).toBe('https://blossom.example');

		expect(capturedAuth.startsWith('Nostr ')).toBe(true);
		const event = JSON.parse(atob(capturedAuth.slice('Nostr '.length)));
		expect(event.kind).toBe(BLOSSOM_AUTH_KIND);
		expect(event.pubkey).toBe(keyring.publicKey);
		expect(event.tags).toEqual(
			expect.arrayContaining([
				['t', 'upload'],
				['x', expectedHash]
			])
		);
		expect(verifySignedEvent(event)).toBe(true);
	});

	it('falls through to the next server when the first fails', async () => {
		const keyring = generateKeyring();
		const blob: BlossomBlob = { url: 'https://second.example/x', sha256: 'abc', size: 1, uploaded: 0 };
		let calls = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				calls++;
				if (calls === 1) return new Response('nope', { status: 500 });
				return new Response(JSON.stringify(blob), { status: 200 });
			})
		);

		const result = await uploadToBlossom(fakeFile([1]), ['https://first.example', 'https://second.example'], keyring);
		expect(calls).toBe(2);
		expect(result.server).toBe('https://second.example');
	});

	it('throws the last error once every configured server has failed', async () => {
		const keyring = generateKeyring();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('nope', { status: 500 }))
		);

		await expect(uploadToBlossom(fakeFile([1]), ['https://a.example', 'https://b.example'], keyring)).rejects.toThrow();
	});
});

describe('blobToPostImage / postImageFromUrl', () => {
	it('maps a blob descriptor to a PostImage', () => {
		const blob: BlossomBlob = { url: 'https://x.example/1', sha256: 'deadbeef', size: 42, type: 'image/jpeg', uploaded: 0 };
		expect(blobToPostImage(blob)).toEqual({ url: 'https://x.example/1', sha256: 'deadbeef', size: 42, mime: 'image/jpeg' });
	});

	it('builds a bare PostImage from a pasted URL', () => {
		expect(postImageFromUrl('https://example.com/a.png')).toEqual({ url: 'https://example.com/a.png' });
	});
});
