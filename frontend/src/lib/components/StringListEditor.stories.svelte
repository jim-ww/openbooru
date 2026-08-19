<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import StringListEditor from './StringListEditor.svelte';

	const { Story } = defineMeta({
		title: 'Components/StringListEditor',
		component: StringListEditor,
		tags: ['autodocs']
	});
</script>

<Story name="Relays" args={{ items: ['wss://nos.lol', 'wss://relay.primal.net'], placeholder: 'wss://relay.example.com' }} />
<Story name="Empty" args={{ items: [], placeholder: 'tag_to_block' }} />
