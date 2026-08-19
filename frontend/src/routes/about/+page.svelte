<script lang="ts">
	import { resolve } from '$app/paths';
	import { externalLink } from '$lib/wails';
	import SeoHead from '$lib/components/SeoHead.svelte';
</script>

<SeoHead
	title="About — openbooru"
	description="How openbooru works: a decentralized, unmoderated, Danbooru/Gelbooru-style imageboard built on Nostr, with images on Blossom and no central server."
/>

<div class="mx-auto max-w-3xl px-6 py-16">
	<h1 class="pb-8 text-3xl font-bold tracking-tight">About openbooru</h1>

	<div class="flex flex-col gap-8 text-base text-foreground/80">
		<section>
			<p>
				openbooru is a decentralized, unmoderated imageboard — post images, tag them, search by tag, comment, and
				vote, without a server standing between you and the network. If you've used Danbooru or Gelbooru, the
				tagging and browsing conventions will feel familiar — openbooru follows the same ideas, just without a
				central server or moderators behind them.
			</p>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">How it works</h2>
			<ul class="flex list-disc flex-col gap-2 pl-5">
				<li><strong>No backend.</strong> openbooru ships as a static site or a desktop binary. There is no server of ours in the loop.</li>
				<li>
					<strong>Peer-to-peer.</strong> Every post, comment, and vote travels over
					<a href="https://nostr.com" use:externalLink target="_blank" rel="noreferrer" class="underline">Nostr</a>, an open
					relay-based protocol, through relays anyone can run — including you.
				</li>
				<li>
					<strong>Images live on Blossom.</strong> Media is stored on
					<a href="https://github.com/hzrd149/blossom" use:externalLink target="_blank" rel="noreferrer" class="underline"
						>Blossom</a
					>
					servers, addressed by content hash — you can configure your own, or paste a direct URL instead.
				</li>
				<li>
					<strong>You own your identity.</strong> Users are identified by a public key, not a username/password pair. Every
					post is signed client-side (secp256k1); nothing you publish can be forged or reassigned by anyone else,
					including a relay operator.
				</li>
				<li><strong>No moderation.</strong> There is no admin account, no takedown mechanism beyond what Nostr's own best-effort delete requests provide, and no one positioned to remove content on our end.</li>
				<li><strong>Free as in freedom.</strong> AGPLv3. Run it, read it, modify it, fork it, self-host a relay or a Blossom server.</li>
			</ul>
		</section>

		<section>
			<h2 class="pb-2 text-xl font-semibold text-foreground">Support the project</h2>
			<p class="pb-2">openbooru has no subscription and no ads, and never will. If you'd like to support it anyway, donations are welcome.</p>
			<p class="pb-1 text-sm font-medium">Monero (XMR)</p>
			<code class="block overflow-x-auto rounded-md bg-muted p-2 text-xs">
				83YGRqP8uHed6NeegZQeX9ccCxbzoRHHEEi7pTwk4aqdJZEVXXA6NWtetnsEM2v33zFBBt3Rp6DNhU9qhJEGPspU14yN8t7
			</code>
		</section>

		<section>
			<p>
				<a href={resolve('/legal')} class="underline">Legal</a> —
				what "no moderation" and "software, not a service" actually mean.
			</p>
		</section>
	</div>

	<div class="pt-12">
		<a href={resolve('/')} class="text-sm text-muted-foreground underline hover:text-foreground">Back home</a>
	</div>
</div>
