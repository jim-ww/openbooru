import type { Rating } from '$lib/types';

/** Literal (not computed) Tailwind classes per rating, so Tailwind's
 *  static build-time class scanner can find them. */
export const RATING_BADGE_CLASSES: Record<Rating, string> = {
	general: 'text-rating-general border-rating-general/40 bg-rating-general/10',
	sensitive: 'text-rating-sensitive border-rating-sensitive/40 bg-rating-sensitive/10',
	explicit: 'text-rating-explicit border-rating-explicit/40 bg-rating-explicit/10'
};

export const RATING_BORDER_CLASSES: Record<Rating, string> = {
	general: 'ring-rating-general/50',
	sensitive: 'ring-rating-sensitive/60',
	explicit: 'ring-rating-explicit/70'
};

export const RATING_LABELS: Record<Rating, string> = {
	general: 'General',
	sensitive: 'Sensitive',
	explicit: 'Explicit'
};
