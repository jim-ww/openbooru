/** Standard NIP kinds this app publishes/reads. */
export const POST_KIND = 20; // NIP-68 picture-first post
export const COMMENT_KIND = 1111; // NIP-22 generic comment
export const REACTION_KIND = 7; // NIP-25 reaction/like/vote
export const PROFILE_KIND = 0; // NIP-01 metadata
export const RELAY_LIST_KIND = 10002; // NIP-65 relay list metadata
export const DELETE_REQUEST_KIND = 5; // NIP-09 delete request
export const BLOSSOM_AUTH_KIND = 24242; // BUD-02 Blossom authorization event

/** Custom application-specific kind, in the addressable-event range
 *  (30000-39999) NIP-01 reserves for parameterized replaceable events with no
 *  central registry. Deliberately a different number than the sibling
 *  charshare project's own username-claim kind (31334), so both apps'
 *  events don't collide if a user runs both against the same relays/pubkey
 *  — re-verify against the current NIP kind registry before shipping in
 *  case of a later collision; renumbering is a one-file change since every
 *  module imports from here. */
export const USERNAME_CLAIM_KIND = 31335;
