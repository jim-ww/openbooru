import { isWailsDesktop } from '$lib/wails';

/** Forwards browser console output and uncaught errors to the Wails Go
 *  process' stdout via a custom event (v3's runtime module dropped v2's
 *  dedicated LogInfo/LogError calls — see app.go's console-forward event
 *  handler). No-op everywhere else (plain `pnpm dev`, tests, browsers). */
export function installWailsConsoleForward(): void {
	if (!isWailsDesktop()) return;

	const stringify = (args: unknown[]) =>
		args
			.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)))
			.join(' ');

	// Loaded lazily (rather than importing the runtime module here directly)
	// so this file stays import-free of Wails-only paths until it's already
	// confirmed to be running inside the desktop app.
	const runtimeUrl = '/wails/runtime.js';
	const emit = (level: 'info' | 'error', message: string) => {
		void import(/* @vite-ignore */ runtimeUrl).then((mod) => {
			(mod as { Events: { Emit(name: string, data: unknown): Promise<boolean> } }).Events.Emit('console:forward', {
				level,
				message
			});
		});
	};

	const original = { log: console.log, warn: console.warn, error: console.error };
	console.log = (...args) => {
		emit('info', stringify(args));
		original.log(...args);
	};
	console.warn = (...args) => {
		emit('info', `[warn] ${stringify(args)}`);
		original.warn(...args);
	};
	console.error = (...args) => {
		emit('error', stringify(args));
		original.error(...args);
	};

	window.addEventListener('error', (event) => {
		emit('error', `Uncaught: ${event.message}\n${event.error?.stack ?? ''}`);
	});
	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason;
		const detail = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason);
		emit('error', `Unhandled rejection: ${detail}`);
	});
}
