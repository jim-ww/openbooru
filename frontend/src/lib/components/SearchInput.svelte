<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import Search from '@lucide/svelte/icons/search';
	import { suggestTags } from '$lib/tags';

	let {
		value = $bindable(''),
		onsubmit,
		placeholder = 'Search tags…',
		class: className = ''
	}: {
		value?: string;
		onsubmit: (query: string) => void;
		placeholder?: string;
		class?: string;
	} = $props();

	let suggestions = $state<{ tag: string; count: number }[]>([]);
	let highlighted = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	// The word currently being typed — the part after the last space, with
	// any leading "-" (exclusion syntax) stripped so it still matches tag
	// names. A "rating:"/"order:" token is a filter keyword, not a tag, so
	// it never gets tag suggestions.
	function currentWord(text: string): string {
		const lastSpace = text.lastIndexOf(' ');
		const word = lastSpace === -1 ? text : text.slice(lastSpace + 1);
		return word.startsWith('-') ? word.slice(1) : word;
	}

	async function refreshSuggestions() {
		const word = currentWord(value);
		if (!word || word.includes(':')) {
			suggestions = [];
			return;
		}
		suggestions = await suggestTags(word);
		highlighted = 0;
	}

	function acceptSuggestion(tag: string) {
		const lastSpace = value.lastIndexOf(' ');
		const before = lastSpace === -1 ? '' : value.slice(0, lastSpace + 1);
		const prefix = value.slice(lastSpace + 1).startsWith('-') ? '-' : '';
		value = `${before}${prefix}${tag} `;
		suggestions = [];
		inputEl?.focus();
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		suggestions = [];
		onsubmit(value.trim());
	}

	function onKeydown(event: KeyboardEvent) {
		if (suggestions.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlighted = (highlighted + 1) % suggestions.length;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlighted = (highlighted - 1 + suggestions.length) % suggestions.length;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			acceptSuggestion(suggestions[highlighted].tag);
		} else if (event.key === 'Escape') {
			suggestions = [];
		}
	}
</script>

<form onsubmit={submit} class="relative {className}">
	<Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
	<Input
		bind:ref={inputEl}
		type="search"
		{placeholder}
		bind:value
		oninput={refreshSuggestions}
		onkeydown={onKeydown}
		onblur={() => (suggestions = [])}
		autocomplete="off"
		class="h-9 pl-8"
	/>
	{#if suggestions.length > 0}
		<ul class="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
			{#each suggestions as s, i (s.tag)}
				<li>
					<button
						type="button"
						class="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-accent {i === highlighted
							? 'bg-accent'
							: ''}"
						onmousedown={(e) => e.preventDefault()}
						onclick={() => acceptSuggestion(s.tag)}
					>
						<span>{s.tag}</span>
						<span class="text-xs text-muted-foreground">~{s.count} seen</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</form>
