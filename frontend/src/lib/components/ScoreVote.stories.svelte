<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ScoreVote from './ScoreVote.svelte';

	const { Story } = defineMeta({
		title: 'Components/ScoreVote',
		component: ScoreVote,
		tags: ['autodocs']
	});
</script>

<Story name="No votes yet" args={{ target: { type: 'post', id: 'demo:1' }, score: 0 }} />
<Story name="Upvoted" args={{ target: { type: 'post', id: 'demo:2' }, score: 12, ownVote: '+' }} />
<Story name="Downvoted" args={{ target: { type: 'post', id: 'demo:3' }, score: -3, ownVote: '-' }} />
<Story name="Popular" args={{ target: { type: 'post', id: 'demo:4' }, score: 248 }} />
