import type { Rating } from './rating';

export interface Preferences {
	nostrRelays: string[];
	blossomServers: string[];
	blockedTags: string[];
	blockedAuthors: string[];
	hiddenPostIds: string[];
	hiddenCommentIds: string[];
	// Ratings included in Browse/search by default — explicit is opt-in.
	visibleRatings: Rating[];
	theme: 'system' | 'light' | 'dark';
	gridDensity: 'small' | 'large';
}
