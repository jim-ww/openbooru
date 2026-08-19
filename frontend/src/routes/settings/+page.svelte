<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import SeoHead from '$lib/components/SeoHead.svelte';
	import StringListEditor from '$lib/components/StringListEditor.svelte';
	import { RATINGS, type Rating } from '$lib/types';
	import { RATING_LABELS } from '$lib/ratingStyle';
	import { getPreferences, updatePreferences } from '$lib/state/preferences.svelte';
	import { getKeyring, getCurrentUser, isAccountRegistered, markRegistered, setKeyring, logout } from '$lib/state/auth.svelte';
	import { publishProfile } from '$lib/nostr/profile';
	import { exportAccountBackup, parseAccountBackup } from '$lib/identity/backup';
	import { setMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';

	const preferences = $derived(getPreferences());

	let nostrRelays = $state(getPreferences().nostrRelays);
	let blossomServers = $state(getPreferences().blossomServers);
	let blockedTags = $state(getPreferences().blockedTags);
	let blockedAuthors = $state(getPreferences().blockedAuthors);

	let username = $state('');
	let description = $state('');
	let savingProfile = $state(false);

	let backupText = $state('');
	let restoreText = $state('');

	function toggleRating(rating: Rating) {
		const current = preferences.visibleRatings;
		const next = current.includes(rating) ? current.filter((r) => r !== rating) : [...current, rating];
		void updatePreferences({ visibleRatings: next });
	}

	async function saveNetwork() {
		await updatePreferences({ nostrRelays, blossomServers });
		toast.success('Saved.');
	}

	async function saveBlocklists() {
		await updatePreferences({ blockedTags, blockedAuthors });
		toast.success('Saved.');
	}

	async function saveProfile() {
		savingProfile = true;
		try {
			await publishProfile({ username, description });
			await markRegistered();
			toast.success('Profile published.');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to publish profile.');
		} finally {
			savingProfile = false;
		}
	}

	function showBackup() {
		const keyring = getKeyring();
		if (!keyring) return;
		backupText = exportAccountBackup(keyring);
	}

	async function copyBackup() {
		await navigator.clipboard.writeText(backupText);
		toast.success('Copied to clipboard.');
	}

	async function restoreBackup() {
		try {
			const { keyring, profileFields } = parseAccountBackup(restoreText);
			await setKeyring(keyring);
			if (profileFields) await markRegistered();
			toast.success('Account restored.');
			restoreText = '';
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Failed to restore backup.');
		}
	}

	async function handleLogout() {
		if (!confirm('Switch to a fresh guest identity? Make sure you backed up your current account first.')) return;
		await logout();
		toast.success('Switched to a new local identity.');
	}
</script>

<SeoHead title="Settings — openbooru" noindex />

<div class="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
	<h1 class="text-xl font-bold">Settings</h1>

	<Card>
		<CardHeader>
			<CardTitle>Account</CardTitle>
			<CardDescription>
				{#if getCurrentUser()}
					{nip19.npubEncode(getCurrentUser() ?? '')} — {isAccountRegistered() ? 'registered' : 'local guest only'}
				{/if}
			</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			{#if !isAccountRegistered()}
				<div class="flex flex-col gap-2">
					<Label for="username">Username</Label>
					<Input id="username" bind:value={username} placeholder="Pick a username" />
					<Label for="description">Bio</Label>
					<Textarea id="description" bind:value={description} rows={2} />
					<Button onclick={saveProfile} disabled={savingProfile} class="self-start">
						{savingProfile ? 'Publishing…' : 'Create account'}
					</Button>
				</div>
			{/if}

			<div class="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
				<div class="flex items-start gap-2">
					<KeyRound class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
					<p class="text-sm">
						<strong>This key is your entire account</strong> — there's no username-and-password login to fall back on. It
						works like a login and password combined into one secret. Anyone who has it can post as you; if you lose
						it, it cannot be reset or recovered, by us or anyone else. Copy it now and keep it somewhere safe (a
						password manager is ideal).
					</p>
				</div>
				<div class="flex flex-col gap-2">
					<Button variant="outline" size="sm" class="self-start" onclick={showBackup}>Show my account key</Button>
					{#if backupText}
						<Textarea readonly value={backupText} rows={4} class="font-mono text-xs" />
						<Button variant="outline" size="sm" class="self-start" onclick={copyBackup}>Copy to clipboard</Button>
					{/if}
				</div>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="restore">Already have an account? Paste its key here to use it on this device</Label>
				<Textarea id="restore" bind:value={restoreText} rows={2} class="font-mono text-xs" placeholder="nsec1… or a full backup JSON" />
				<Button variant="outline" size="sm" class="self-start" onclick={restoreBackup} disabled={!restoreText.trim()}>
					Switch to this account
				</Button>
			</div>

			<div class="flex flex-col gap-1">
				<Button variant="destructive" size="sm" class="self-start" onclick={handleLogout}>Switch to new identity</Button>
				<p class="text-xs text-muted-foreground">
					Replaces your current key with a brand new one on this device. Make sure you've backed up the current key
					first — this can't be undone.
				</p>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Network</CardTitle>
			<CardDescription>Nostr relays and Blossom media servers.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<div>
				<Label>Nostr relays</Label>
				<StringListEditor bind:items={nostrRelays} placeholder="wss://relay.example.com" />
			</div>
			<div>
				<Label>Blossom servers</Label>
				<StringListEditor bind:items={blossomServers} placeholder="https://blossom.example.com" />
			</div>
			<Button onclick={saveNetwork} size="sm" class="self-start">Save</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Content</CardTitle>
			<CardDescription>Ratings shown by default, and local blocklists.</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<div>
				<Label>Visible ratings</Label>
				<div class="mt-1.5 flex gap-2">
					{#each RATINGS as rating (rating)}
						<Button
							variant={preferences.visibleRatings.includes(rating) ? 'default' : 'outline'}
							size="sm"
							onclick={() => toggleRating(rating)}
						>
							{RATING_LABELS[rating]}
						</Button>
					{/each}
				</div>
			</div>
			<div>
				<Label>Blocked tags</Label>
				<StringListEditor bind:items={blockedTags} placeholder="tag_to_block" />
			</div>
			<div>
				<Label>Blocked authors (pubkey)</Label>
				<StringListEditor bind:items={blockedAuthors} placeholder="hex pubkey" />
			</div>
			<Button onclick={saveBlocklists} size="sm" class="self-start">Save</Button>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>Appearance</CardTitle>
		</CardHeader>
		<CardContent class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => setMode('light')}>Light</Button>
			<Button variant="outline" size="sm" onclick={() => setMode('dark')}>Dark</Button>
			<Button variant="outline" size="sm" onclick={() => setMode('system')}>System</Button>
		</CardContent>
	</Card>
</div>
