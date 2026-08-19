import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from './parseQuery';

describe('parseSearchQuery', () => {
	it('parses plain tags as include tags', () => {
		expect(parseSearchQuery('outdoors 1girl')).toEqual({
			includeTags: ['outdoors', '1girl'],
			excludeTags: [],
			rating: null,
			order: null
		});
	});

	it('parses -tag as an exclusion', () => {
		expect(parseSearchQuery('outdoors -indoors')).toEqual({
			includeTags: ['outdoors'],
			excludeTags: ['indoors'],
			rating: null,
			order: null
		});
	});

	it('parses rating: as a meta-tag, not a literal tag', () => {
		expect(parseSearchQuery('outdoors rating:explicit')).toEqual({
			includeTags: ['outdoors'],
			excludeTags: [],
			rating: 'explicit',
			order: null
		});
	});

	it('ignores an invalid rating value', () => {
		expect(parseSearchQuery('rating:bogus')).toEqual({
			includeTags: [],
			excludeTags: [],
			rating: null,
			order: null
		});
	});

	it('parses order: as a meta-tag', () => {
		expect(parseSearchQuery('order:score')).toEqual({
			includeTags: [],
			excludeTags: [],
			rating: null,
			order: 'score'
		});
		expect(parseSearchQuery('order:new').order).toBe('new');
	});

	it('ignores an invalid order value', () => {
		expect(parseSearchQuery('order:bogus').order).toBeNull();
	});

	it('lowercases tags and meta-tags', () => {
		expect(parseSearchQuery('Outdoors RATING:EXPLICIT ORDER:SCORE')).toEqual({
			includeTags: ['outdoors'],
			excludeTags: [],
			rating: 'explicit',
			order: 'score'
		});
	});

	it('collapses repeated whitespace and trims', () => {
		expect(parseSearchQuery('  a   b  ').includeTags).toEqual(['a', 'b']);
	});

	it('returns an empty parse for a blank query', () => {
		expect(parseSearchQuery('   ')).toEqual({ includeTags: [], excludeTags: [], rating: null, order: null });
	});

	it('combines include, exclude, rating, and order together', () => {
		expect(parseSearchQuery('cat -dog rating:general order:new')).toEqual({
			includeTags: ['cat'],
			excludeTags: ['dog'],
			rating: 'general',
			order: 'new'
		});
	});
});
