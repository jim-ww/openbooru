// Minimal stand-in for SvelteKit's $app/navigation under vitest (aliased in vite.config.ts).
export function pushState(_url: string | URL, _state: unknown): void {}
export function replaceState(_url: string | URL, _state: unknown): void {}
export async function goto(_url: string | URL): Promise<void> {}
export function beforeNavigate(_callback: (...args: unknown[]) => void): void {}
export function afterNavigate(_callback: (...args: unknown[]) => void): void {}
export function invalidate(_url?: string | URL | ((url: URL) => boolean)): Promise<void> {
	return Promise.resolve();
}
export function invalidateAll(): Promise<void> {
	return Promise.resolve();
}
