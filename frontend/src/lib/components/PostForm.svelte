<script lang="ts">
	import UploadDropzone from './UploadDropzone.svelte';
	import TagInput from './TagInput.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { RATING_LABELS } from '$lib/ratingStyle';
	import { RATINGS, type Post, type PostImage, type Rating } from '$lib/types';
	import { uploadToBlossom, blobToPostImage, postImageFromUrl } from '$lib/blossom/upload';
	import { publishPost } from '$lib/nostr/posts';
	import { getKeyring, getCurrentUser, isAccountRegistered } from '$lib/state/auth.svelte';
	import { getActiveBlossomServers } from '$lib/state/preferences.svelte';
	import { toast } from 'svelte-sonner';
	import X from '@lucide/svelte/icons/x';

	interface PendingFile {
		file?: File; // absent for an image carried over from `existing`
		previewUrl: string;
		status: 'pending' | 'uploading' | 'done' | 'error';
		image?: PostImage;
		error?: string;
	}

	let { existing, onPublish }: { existing?: Post; onPublish: (post: Post) => void } = $props();

	let pending = $state<PendingFile[]>(
		(existing?.images ?? []).map((image) => ({ previewUrl: image.url, status: 'done', image }))
	);
	let externalUrl = $state('');
	let content = $state(existing?.content ?? '');
	let tags = $state<string[]>(existing?.tags ?? []);
	let rating = $state<Rating>(existing?.rating ?? 'general');
	let publishing = $state(false);

	function addFiles(files: File[]) {
		for (const file of files) {
			pending = [...pending, { file, previewUrl: URL.createObjectURL(file), status: 'pending' }];
		}
	}

	function addExternalUrl() {
		const url = externalUrl.trim();
		if (!url) return;
		pending = [...pending, { previewUrl: url, status: 'done', image: postImageFromUrl(url) }];
		externalUrl = '';
	}

	function removeAt(index: number) {
		pending = pending.filter((_, i) => i !== index);
	}

	async function uploadAll(): Promise<PostImage[]> {
		const keyring = getKeyring();
		if (!keyring) throw new Error('No identity available yet.');
		const servers = getActiveBlossomServers();

		const images: PostImage[] = [];
		for (let i = 0; i < pending.length; i++) {
			const item = pending[i];
			if (item.status === 'done' && item.image) {
				images.push(item.image);
				continue;
			}
			if (!item.file) continue;
			pending[i] = { ...item, status: 'uploading' };
			try {
				const { blob } = await uploadToBlossom(item.file, servers, keyring);
				const image = blobToPostImage(blob);
				pending[i] = { ...pending[i], status: 'done', image };
				images.push(image);
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Upload failed.';
				pending[i] = { ...pending[i], status: 'error', error: message };
				throw new Error(`Failed to upload ${item.file.name || 'image'}: ${message}`);
			}
		}
		return images;
	}

	async function submit() {
		if (!getCurrentUser() || !isAccountRegistered()) {
			toast.error('Create an account in Settings before posting.');
			return;
		}
		if (pending.length === 0) {
			toast.error('Add at least one image.');
			return;
		}
		publishing = true;
		try {
			const images = await uploadAll();
			const post = await publishPost({ id: existing?.id, content, images, tags, rating });
			toast.success(existing ? 'Post updated.' : 'Post published.');
			onPublish(post);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to publish post.');
		} finally {
			publishing = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<UploadDropzone onFiles={addFiles} />

	<div class="flex gap-2">
		<Input placeholder="…or paste an image URL" bind:value={externalUrl} />
		<Button variant="outline" onclick={addExternalUrl}>Add URL</Button>
	</div>

	{#if pending.length > 0}
		<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
			{#each pending as item, i (item.previewUrl)}
				<div class="relative aspect-square overflow-hidden rounded-md bg-muted">
					<img src={item.previewUrl} alt="" class="size-full object-cover" />
					{#if item.status === 'uploading'}
						<div class="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white">Uploading…</div>
					{:else if item.status === 'error'}
						<div class="absolute inset-0 flex items-center justify-center bg-destructive/70 p-1 text-center text-[10px] text-white">
							{item.error}
						</div>
					{/if}
					<button
						type="button"
						class="absolute top-1 right-1 rounded bg-black/60 p-1 text-white"
						onclick={() => removeAt(i)}
						aria-label="Remove image"
					>
						<X class="size-3" />
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<div>
		<Label for="caption">Caption</Label>
		<Textarea id="caption" bind:value={content} rows={3} placeholder="Optional description…" />
	</div>

	<div>
		<Label>Tags</Label>
		<TagInput bind:tags />
	</div>

	<div>
		<Label>Rating</Label>
		<div class="mt-1.5 flex gap-2">
			{#each RATINGS as r (r)}
				<Button variant={rating === r ? 'default' : 'outline'} size="sm" onclick={() => (rating = r)}>
					{RATING_LABELS[r]}
				</Button>
			{/each}
		</div>
	</div>

	<Button onclick={submit} disabled={publishing} size="lg">
		{publishing ? (existing ? 'Saving…' : 'Publishing…') : existing ? 'Save changes' : 'Publish'}
	</Button>
</div>
