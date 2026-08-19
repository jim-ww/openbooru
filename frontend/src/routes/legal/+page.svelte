<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>Legal — openbooru</title></svelte:head>

<div class="mx-auto max-w-3xl px-6 py-16">
	<h1 class="pb-8 text-3xl font-bold tracking-tight">Legal</h1>

	<div class="flex flex-col gap-8 text-base text-foreground/80">
		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">Software, not a service</h2>
			<p>
				openbooru is client software you run — in a browser or as a desktop binary. There is no server of ours that
				stores, transmits, or serves anyone's content. Everything published goes directly from your device to Nostr
				relays and Blossom media servers that you or others choose to use.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">No moderation</h2>
			<p>
				There is no admin account, no report queue, and no takedown mechanism beyond Nostr's own best-effort delete
				requests — which any relay is free to ignore. We do not review, approve, or remove content, and have no
				technical ability to do so across the network.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">Your responsibility</h2>
			<p>
				Users are solely responsible for content they publish, under the laws of their own jurisdiction. Running
				openbooru, a relay, or a Blossom server does not make you responsible for what others publish through the
				same infrastructure, but publishing content is your own decision and your own responsibility.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">Third-party infrastructure</h2>
			<p>
				Default relays and Blossom servers are provided by third parties, not us. We make no guarantee about their
				availability, retention, or behavior — configure your own in Settings if you need something different.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">No warranty</h2>
			<p>
				openbooru is provided "as is," without warranty of any kind. See the
				<a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer" class="underline"
					>AGPLv3 license</a
				> for the full terms.
			</p>
		</section>
	</div>

	<div class="pt-12">
		<a href={resolve('/')} class="text-sm text-muted-foreground underline hover:text-foreground">Back home</a>
	</div>
</div>
