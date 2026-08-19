/** Wails only exists inside the desktop webview — a no-op everywhere else
 *  (plain `pnpm dev`, tests, browsers). Detected via the "wails.io" User-Agent
 *  fragment that Wails v3 sets on every platform's webview, which is
 *  synchronous and import-free — the generated service bindings and runtime
 *  are only reachable by importing "/wails/runtime.js", which this file only
 *  does once it already knows it's running inside Wails. Trying to import it
 *  unconditionally would make Vite try to resolve that Wails-served path in
 *  the plain website build too. */

export function isWailsDesktop(): boolean {
	return typeof navigator !== 'undefined' && navigator.userAgent.includes('wails.io');
}

// Hand-written types for the runtime module (`/wails/runtime.js`) exports
// this file needs, rather than depending on the `@wailsio/runtime` npm
// package just for types.
interface WailsRuntimeModule {
	Events: {
		On(eventName: string, callback: (event: { data: unknown }) => void): () => void;
	};
	Browser: {
		OpenURL(url: string): Promise<void>;
	};
	Window: {
		Reload(): Promise<void>;
	};
}

// A variable (rather than a string literal) keeps TypeScript from trying to
// statically resolve this Wails-served, not-on-disk path as a module
// specifier — the /* @vite-ignore */ does the equivalent for Vite's bundler.
const RUNTIME_URL = '/wails/runtime.js';

let runtimeModule: Promise<WailsRuntimeModule> | null = null;
function loadRuntime(): Promise<WailsRuntimeModule> {
	if (!runtimeModule) {
		runtimeModule = (import(/* @vite-ignore */ RUNTIME_URL) as Promise<WailsRuntimeModule>).catch(
			(err: unknown) => {
				runtimeModule = null;
				throw err;
			}
		);
	}
	return runtimeModule;
}

/** Opens a URL in the user's default system browser. Plain `<a
 *  target="_blank">` clicks don't reliably escape Wails' webview (notably
 *  webkitgtk on Linux), so external links must go through this instead. */
export async function openURL(url: string): Promise<void> {
	const { Browser } = await loadRuntime();
	await Browser.OpenURL(url);
}

/** Reloads the current window through Wails' own native runtime call rather
 *  than `location.reload()` — the app is served from a custom wails.localhost
 *  scheme that a plain browser-side reload can't always re-navigate to. Use
 *  this anywhere a change (e.g. the relay list) needs a full restart of the
 *  app's init sequence to take effect. */
export async function reloadWindow(): Promise<void> {
	const { Window } = await loadRuntime();
	await Window.Reload();
}

/** Svelte action for `<a target="_blank">` links to external sites: routes
 *  the click through {@link openURL} inside the Wails desktop build, and is
 *  a no-op everywhere else (the browser's normal navigation handles it). */
export function externalLink(node: HTMLAnchorElement) {
	if (!isWailsDesktop()) return;
	function onClick(e: MouseEvent) {
		e.preventDefault();
		void openURL(node.href);
	}
	node.addEventListener('click', onClick);
	return {
		destroy() {
			node.removeEventListener('click', onClick);
		}
	};
}
