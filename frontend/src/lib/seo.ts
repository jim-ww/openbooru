// The site's real deployed URL (GitHub Pages project site) — used to build
// absolute canonical/Open Graph URLs. Wails desktop builds never get
// crawled, so this only matters for the static-site build.
export const SITE_URL = 'https://jim-ww.github.io/openbooru';

export function canonicalUrl(pathname: string): string {
	return `${SITE_URL}${pathname === '/' ? '' : pathname}`;
}
