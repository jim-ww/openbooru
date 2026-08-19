<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagChip from './TagChip.svelte';

	const { Story } = defineMeta({
		title: 'Components/TagChip',
		component: TagChip,
		tags: ['autodocs'],
		argTypes: {
			tag: { control: 'text' },
			count: { control: 'number' }
		}
	});
</script>

<Story name="General" args={{ tag: 'outdoors' }} />
<Story name="Artist" args={{ tag: 'artist:hoge' }} />
<Story name="Character" args={{ tag: 'character:asuka' }} />
<Story name="Copyright" args={{ tag: 'copyright:evangelion' }} />
<Story name="Meta" args={{ tag: 'meta:high_resolution' }} />
<Story name="With seen-count" args={{ tag: 'outdoors', count: 42 }} />
