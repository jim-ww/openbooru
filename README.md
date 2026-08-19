<div align="center">

# openbooru

**Decentralized, unmoderated imageboard on Nostr.**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPLv3-blue.svg)](LICENSE)
[![Built with SvelteKit](https://img.shields.io/badge/frontend-SvelteKit-ff3e00)](https://kit.svelte.dev)
[![Powered by Nostr](https://img.shields.io/badge/network-Nostr-8e44ad)](https://nostr.com)
[![Desktop app via Wails](https://img.shields.io/badge/desktop-Wails-8A2BE2)](https://wails.io)

[Live app](https://jim-ww.github.io/openbooru/) · [Releases](https://github.com/jim-ww/openbooru/releases) · [Legal](https://jim-ww.github.io/openbooru/legal)

</div>

---

## What is this

openbooru lets you post images, tag them, search by tag, comment, and vote — without signing up, a server, or anyone standing between you and the network.

- **No backend.** openbooru ships as a static site (deployable from any CDN) or a desktop binary. There is no server of ours in the loop.
- **Peer-to-peer.** Anything you publish travels over [Nostr](https://nostr.com), an open relay-based protocol, through relays anyone can run — including you.
- **Images live on Blossom.** Media is stored on [Blossom](https://github.com/hzrd149/blossom) servers, content-addressed by sha256 — configure your own, or paste a direct URL instead.
- **You own your identity.** Users are identified by a public key, not a username/password pair. Every post is signed client-side (secp256k1); nothing you publish can be forged or reassigned by anyone else, including a relay operator.
- **No moderation.** There is no admin account and no takedown mechanism beyond Nostr's own best-effort delete requests, which any relay is free to ignore.
- **Free as in freedom.** AGPLv3. Run it, read it, modify it, fork it, self-host a relay or a Blossom server.

## Features

| | |
|---|---|
| **Browse** | Feed, tag pages, and advanced search (`tag1 tag2 -exclude rating:general order:score`); block tags/authors locally |
| **Posts** | Upload one or more images (Blossom, or a pasted URL), caption, tag, rate (general/sensitive/explicit); best-effort deletion |
| **Tags** | Danbooru/Gelbooru-style colored categories (artist/character/copyright/general/meta) via an optional `namespace:value` convention; local autocomplete and related-tags |
| **Voting** | Danbooru-style up/down score, not just a like |
| **Comments** | Threaded one level deep, author badge, best-effort deletion |
| **Profiles** | Signed profile documents, `@username` claims |

## Try it

- **In the browser**, no install: **[jim-ww.github.io/openbooru](https://jim-ww.github.io/openbooru/)**
- **As a desktop app**, download a binary from [Releases](https://github.com/jim-ww/openbooru/releases) (Linux, Windows, macOS)
- **Via Nix, try it or add it to your flake**:

  ```sh
  nix run github:jim-ww/openbooru
  ```

## Building from source

The frontend (SvelteKit + Tailwind/shadcn-svelte) is wrapped in a [Wails](https://wails.io) desktop shell, but also builds standalone as a static site — same code, either target.

### With Nix (recommended)

```sh
nix build           # produces the desktop binary at ./result/bin/openbooru
```

### Without Nix

Requires Go 1.25+, [Wails CLI](https://wails.io/docs/gettingstarted/installation), Node.js, and pnpm. On Linux you'll also need `webkit2gtk` (4.1) and `gtk3` dev packages.

```sh
cd frontend && pnpm install && cd ..
wails build         # desktop binary in ./build/bin
```

To build the frontend alone as a static site (no Wails/Go needed):

```sh
cd frontend
pnpm install
pnpm run build      # outputs to frontend/dist
```

## Legal

Users are solely responsible for content they publish, under the laws of their own jurisdiction — openbooru is software, not a service, and takes no responsibility for what anyone does with it. There is no server, no signup, and no one positioned to moderate or remove anything on our end. See [`/legal`](https://jim-ww.github.io/openbooru/legal) for the full statement.

## Support the Project

openbooru has no subscription and no ads, and never will. If you'd like to support it anyway, donations are welcome.

**Monero (XMR)**
```
83YGRqP8uHed6NeegZQeX9ccCxbzoRHHEEi7pTwk4aqdJZEVXXA6NWtetnsEM2v33zFBBt3Rp6DNhU9qhJEGPspU14yN8t7
```

## License

[AGPLv3](LICENSE). Free to use, study, share, and modify — provided you keep the same freedoms for others.
