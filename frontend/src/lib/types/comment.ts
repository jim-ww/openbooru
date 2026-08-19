import type { PostId } from './post';
import type { Signed, Tombstonable } from './signed';

export type CommentId = string; // Nostr event id

export const MAX_COMMENT_LENGTH = 2000;

export interface CommentFields {
	id: CommentId;
	post_id: PostId;
	content: string; // required, non-empty
	parent_id: CommentId | null; // null = top-level comment, otherwise the comment being replied to
}

export type Comment = CommentFields & Signed & Tombstonable;
