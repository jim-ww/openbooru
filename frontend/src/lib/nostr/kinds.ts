/** Standard NIP kinds this app publishes/reads. */
export const COMMENT_KIND = 1111; // NIP-22 generic comment
export const REACTION_KIND = 7; // NIP-25 reaction/like/vote
export const PROFILE_KIND = 0; // NIP-01 metadata
export const RELAY_LIST_KIND = 10002; // NIP-65 relay list metadata
export const DELETE_REQUEST_KIND = 5; // NIP-09 delete request
export const BLOSSOM_AUTH_KIND = 24242; // BUD-02 Blossom authorization event

/** Custom application-specific kinds, in the addressable-event range
 *  (30000-39999) NIP-01 reserves for parameterized replaceable events with
 *  no central registry. Deliberately different numbers than the sibling
 *  charshare project's own kinds (31333 character, 31334 username), so
 *  both apps' events don't collide if a user runs both against the same
 *  relays/pubkey — re-verify against the current NIP kind registry before
 *  shipping in case of a later collision; renumbering is a one-file change
 *  since every module imports from here.
 *
 *  POST_KIND is deliberately NOT NIP-68 (kind 20, a regular/immutable
 *  event): a booru's whole point is a curated, taggable, editable corpus —
 *  kind 20 is a public firehose shared with every other Nostr client that
 *  publishes "a picture" for any reason, which pollutes Browse with
 *  unrelated content that carries none of this app's tags/rating, and
 *  (being a regular event) can never be edited after publish, only
 *  replaced by tombstoning + reposting. An addressable kind fixes both:
 *  only this app publishes to it, and posts.ts can edit tags/rating/
 *  caption in place — the same reasoning as charshare's own character. */
export const POST_KIND = 31338;
export const USERNAME_CLAIM_KIND = 31335;
