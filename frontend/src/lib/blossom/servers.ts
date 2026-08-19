/** Sensible default Blossom (BUD-01/02) media servers, overridable via
 *  Settings — same idiom as nostr/relays.ts's DEFAULT_NOSTR_RELAYS. A fresh
 *  install needs to reach *some* server on the very first upload attempt,
 *  before the user has configured their own. */
export const DEFAULT_BLOSSOM_SERVERS: string[] = ['https://blossom.primal.net', 'https://blossom.band'];
