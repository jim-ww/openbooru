import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

const dirname = import.meta.dirname;

// A separate config from vite.config.ts, deliberately without the
// sveltekit() plugin — that plugin resolves $app/* itself, at a higher
// priority than a plain Vite resolve.alias, which would make the
// browser:true stand-in below unreachable. The plain Svelte plugin plus
// these aliases is all unit tests of $lib modules actually need.
export default defineConfig({
	plugins: [svelte()],
	test: {
		environment: 'node',
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
	},
	resolve: {
		alias: {
			// SvelteKit's real $app/environment reports browser:false under a
			// plain Node test environment, which would make every browser-only
			// module (nostr/pool.ts, db/*.ts) throw on import.
			'$app/environment': path.resolve(dirname, 'src/test/mocks/app-environment.ts'),
			'$app/navigation': path.resolve(dirname, 'src/test/mocks/app-navigation.ts'),
			$lib: path.resolve(dirname, 'src/lib')
		}
	}
});
