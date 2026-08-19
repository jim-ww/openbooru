import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ pages: 'dist', assets: 'dist', fallback: '200.html' }),
			// Wails serves at the root; GitHub Pages project sites serve at
			// github.io/<repo>/, so the build sets BASE_PATH for that case.
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` }
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true
		})
	]
});
