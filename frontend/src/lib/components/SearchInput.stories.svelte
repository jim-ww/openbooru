<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import SearchInput from './SearchInput.svelte';

	const { Story } = defineMeta({
		title: 'Components/SearchInput',
		component: SearchInput,
		tags: ['autodocs'],
		args: {
			onsubmit: (query: string) => console.log('search submit:', query)
		}
	});
</script>

<Story name="Empty" args={{ value: '' }} />
<Story name="With advanced syntax" args={{ value: 'outdoors -indoors rating:general' }} />
