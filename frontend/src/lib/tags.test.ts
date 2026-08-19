import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tagCategory, tagLabel } from './tags';

let store = new Map<string, unknown>();
vi.mock('$lib/crypto/dataEncryption', () => ({
	get: async (key: string) => store.get(key),
	set: async (key: string, value: unknown) => {
		store.set(key, value);
	}
}));

describe('tagCategory / tagLabel', () => {
	it('categorizes a plain tag as general', () => {
		expect(tagCategory('outdoors')).toBe('general');
		expect(tagLabel('outdoors')).toBe('outdoors');
	});

	it('categorizes known namespace prefixes', () => {
		expect(tagCategory('artist:hoge')).toBe('artist');
		expect(tagCategory('character:asuka')).toBe('character');
		expect(tagCategory('copyright:evangelion')).toBe('copyright');
		expect(tagCategory('meta:high_res')).toBe('meta');
	});

	it('falls back to general for an unknown prefix', () => {
		expect(tagCategory('unknown:value')).toBe('general');
	});

	it('strips the namespace prefix for display', () => {
		expect(tagLabel('artist:hoge')).toBe('hoge');
	});
});

describe('recordSeenTags / suggestTags / relatedTags', () => {
	beforeEach(() => {
		store = new Map();
		vi.resetModules();
	});

	it('suggests tags by prefix, most-seen first', async () => {
		const { recordSeenTags, suggestTags } = await import('./tags');
		await recordSeenTags(['1girl', '1boy']);
		await recordSeenTags(['1girl']);

		const suggestions = await suggestTags('1');
		expect(suggestions).toEqual([
			{ tag: '1girl', count: 2 },
			{ tag: '1boy', count: 1 }
		]);
	});

	it('returns nothing for an empty prefix', async () => {
		const { suggestTags } = await import('./tags');
		expect(await suggestTags('')).toEqual([]);
	});

	it('tracks co-occurrence for the related-tags panel', async () => {
		const { recordSeenTags, relatedTags } = await import('./tags');
		await recordSeenTags(['outdoors', 'sky']);
		await recordSeenTags(['outdoors', 'sky']);
		await recordSeenTags(['outdoors', 'tree']);

		const related = await relatedTags('outdoors');
		expect(related).toEqual([
			{ tag: 'sky', count: 2 },
			{ tag: 'tree', count: 1 }
		]);
	});

	it('returns nothing for a tag never seen', async () => {
		const { relatedTags } = await import('./tags');
		expect(await relatedTags('never-seen')).toEqual([]);
	});
});
