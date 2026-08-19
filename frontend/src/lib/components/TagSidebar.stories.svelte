<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TagSidebar from './TagSidebar.svelte';

	const { Story } = defineMeta({
		title: 'Components/TagSidebar',
		component: TagSidebar,
		tags: ['autodocs']
	});
</script>

<Story
	name="Mixed categories"
	args={{
		tags: ['artist:hoge', 'character:asuka', 'character:rei', 'copyright:evangelion', 'outdoors', 'sunset', 'meta:high_resolution']
	}}
/>

<Story name="Empty" args={{ tags: [] }} />

<Story name="General only" args={{ tags: ['outdoors', 'sunset', 'landscape'] }} />
