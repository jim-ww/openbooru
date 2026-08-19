<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import RatingBadge from './RatingBadge.svelte';

	const { Story } = defineMeta({
		title: 'Components/RatingBadge',
		component: RatingBadge,
		tags: ['autodocs'],
		argTypes: {
			rating: { control: 'select', options: ['general', 'sensitive', 'explicit'] }
		}
	});
</script>

<Story name="General" args={{ rating: 'general' }} />
<Story name="Sensitive" args={{ rating: 'sensitive' }} />
<Story name="Explicit" args={{ rating: 'explicit' }} />
