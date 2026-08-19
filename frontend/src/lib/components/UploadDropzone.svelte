<script lang="ts">
	import ImagePlus from '@lucide/svelte/icons/image-plus';

	let { onFiles }: { onFiles: (files: File[]) => void } = $props();
	let dragOver = $state(false);

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		if (event.dataTransfer?.files.length) onFiles(Array.from(event.dataTransfer.files));
	}

	function handleChange(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.length) onFiles(Array.from(input.files));
		input.value = '';
	}
</script>

<label
	class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors {dragOver
		? 'border-primary bg-accent'
		: 'border-border'}"
	ondragover={(event) => {
		event.preventDefault();
		dragOver = true;
	}}
	ondragleave={() => (dragOver = false)}
	ondrop={handleDrop}
>
	<ImagePlus class="size-6" />
	<span>Drop images here, or click to browse</span>
	<input type="file" accept="image/*" multiple class="hidden" onchange={handleChange} />
</label>
