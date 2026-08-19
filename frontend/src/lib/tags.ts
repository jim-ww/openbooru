/** Danbooru/Gelbooru-style tag categories, inferred from an optional
 *  `namespace:value` prefix convention on top of otherwise-flat tags (see
 *  the tag search/autocomplete plan) — `artist:hoge` categorizes as
 *  `artist`, a plain `outdoors` categorizes as `general`. */
export type TagCategory = 'general' | 'artist' | 'character' | 'copyright' | 'meta';

const KNOWN_PREFIXES: Record<string, TagCategory> = {
	artist: 'artist',
	character: 'character',
	copyright: 'copyright',
	meta: 'meta'
};

export function tagCategory(tag: string): TagCategory {
	const separator = tag.indexOf(':');
	if (separator === -1) return 'general';
	return KNOWN_PREFIXES[tag.slice(0, separator)] ?? 'general';
}

/** The display portion of a tag, with any namespace prefix stripped. */
export function tagLabel(tag: string): string {
	const separator = tag.indexOf(':');
	return separator === -1 ? tag : tag.slice(separator + 1);
}

/** Literal (not computed) Tailwind classes per category, so Tailwind's
 *  static build-time class scanner can actually find them — a dynamically
 *  built class string like `text-tag-${category}` would not be found. */
export const TAG_CATEGORY_CLASSES: Record<TagCategory, string> = {
	general: 'text-tag-general border-tag-general/30 bg-tag-general/10',
	artist: 'text-tag-artist border-tag-artist/30 bg-tag-artist/10',
	character: 'text-tag-character border-tag-character/30 bg-tag-character/10',
	copyright: 'text-tag-copyright border-tag-copyright/30 bg-tag-copyright/10',
	meta: 'text-tag-meta border-tag-meta/30 bg-tag-meta/10'
};

export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
	general: 'General',
	artist: 'Artist',
	character: 'Character',
	copyright: 'Copyright',
	meta: 'Meta'
};

/** Best-effort local tag co-occurrence index — there is no backend to serve
 *  an authoritative global one, so this is only ever as complete as what
 *  this browser has actually seen. Used for autocomplete counts and the
 *  "related tags" panel; both are explicitly labeled as local/approximate
 *  in the UI, never presented as a site-wide count. */
const STORE_KEY = 'openbooru:tag-index';

interface TagIndex {
	// tag -> number of posts this browser has seen carrying it
	counts: Record<string, number>;
	// tag -> co-occurring tag -> count, for the related-tags panel
	cooccurrence: Record<string, Record<string, number>>;
}

function emptyIndex(): TagIndex {
	return { counts: {}, cooccurrence: {} };
}

let cached: TagIndex | null = null;

async function loadIndex(): Promise<TagIndex> {
	if (cached) return cached;
	const { get } = await import('$lib/crypto/dataEncryption');
	cached = (await get<TagIndex>(STORE_KEY)) ?? emptyIndex();
	return cached;
}

async function saveIndex(index: TagIndex): Promise<void> {
	cached = index;
	const { set } = await import('$lib/crypto/dataEncryption');
	await set(STORE_KEY, index);
}

/** Records every tag on `tags` as "seen" (and their pairwise co-occurrence)
 *  — call this once per post as it's loaded/browsed, so the local index
 *  grows with normal use instead of needing a separate crawl step. */
export async function recordSeenTags(tags: string[]): Promise<void> {
	if (tags.length === 0) return;
	const index = await loadIndex();
	for (const tag of tags) {
		index.counts[tag] = (index.counts[tag] ?? 0) + 1;
	}
	for (const tag of tags) {
		const co = (index.cooccurrence[tag] ??= {});
		for (const other of tags) {
			if (other === tag) continue;
			co[other] = (co[other] ?? 0) + 1;
		}
	}
	await saveIndex(index);
}

/** Tag-name suggestions starting with `prefix`, sorted by local seen-count
 *  descending — an approximation of Danbooru's autocomplete, not an
 *  authoritative global count. */
export async function suggestTags(prefix: string, limit = 10): Promise<{ tag: string; count: number }[]> {
	const normalized = prefix.trim().toLowerCase();
	if (!normalized) return [];
	const index = await loadIndex();
	return Object.entries(index.counts)
		.filter(([tag]) => tag.startsWith(normalized))
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([tag, count]) => ({ tag, count }));
}

/** Tags most often seen alongside `tag`, sorted by co-occurrence count — the
 *  "related tags" panel. Best-effort/local, same caveat as suggestTags. */
export async function relatedTags(tag: string, limit = 12): Promise<{ tag: string; count: number }[]> {
	const index = await loadIndex();
	const co = index.cooccurrence[tag];
	if (!co) return [];
	return Object.entries(co)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([relatedTag, count]) => ({ tag: relatedTag, count }));
}
