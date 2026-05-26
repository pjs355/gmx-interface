import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export type CommentProfile = {
	_id: string;
	username: string;
};

export type UmbrellaComment = {
	_id: string;
	profile: CommentProfile;
	umbrella: string;
	token?: string;
	comment: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateCommentInput = {
	umbrellaId: string;
	comment: string;
	token?: string;
	accessToken: string;
	identityToken: string;
};

export type DeleteCommentInput = {
	commentId: string;
	accessToken: string;
	identityToken: string;
};

class CommentsService {
	// NOTE: baseUrl is now fetched dynamically via getter to prevent
	// stale URL caching issues that caused production bugs
	private get baseUrl(): string {
		return getPredictionApiBaseUrl();
	}

	async list(umbrellaId: string): Promise<UmbrellaComment[]> {
		if (umbrellaId === undefined) {
			throw new Error("umbrellaId is required to fetch comments");
		}
		const requestUrl = `${this.baseUrl}/comments?umbrellaId=${encodeURIComponent(umbrellaId)}`;
		const response = await fetch(requestUrl);
		if (!response.ok) {
			throw new Error(`Failed to load comments (${response.status})`);
		}
		const payload = await response.json();
		if (!Array.isArray(payload)) {
			throw new Error("Comments response is not an array");
		}
		return payload as UmbrellaComment[];
	}

	async create(input: CreateCommentInput): Promise<UmbrellaComment> {
		if (input.umbrellaId === undefined) {
			throw new Error("umbrellaId is required to create a comment");
		}
		if (input.comment === undefined) {
			throw new Error("comment text is required");
		}
		if (input.accessToken === undefined) {
			throw new Error("access token is required to create a comment");
		}
		if (input.identityToken === undefined) {
			throw new Error("identity token is required to create a comment");
		}
		const requestUrl = `${this.baseUrl}/comments`;
		const bodyPayload: {
			umbrellaId: string;
			comment: string;
			token?: string;
		} = {
			umbrellaId: input.umbrellaId,
			comment: input.comment,
		};
		if (input.token !== undefined) {
			bodyPayload.token = input.token;
		}
		const response = await fetch(requestUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${input.accessToken}`,
				"privy-id-token": input.identityToken,
			},
			body: JSON.stringify(bodyPayload),
		});
		if (!response.ok) {
			throw new Error(`Failed to create comment (${response.status})`);
		}
		const payload = await response.json();
		return payload as UmbrellaComment;
	}

	async delete(input: DeleteCommentInput): Promise<void> {
		if (input.commentId === undefined) {
			throw new Error("commentId is required to delete a comment");
		}
		if (input.accessToken === undefined) {
			throw new Error("access token is required to delete a comment");
		}
		if (input.identityToken === undefined) {
			throw new Error("identity token is required to delete a comment");
		}
		const requestUrl = `${this.baseUrl}/comments/${input.commentId}`;
		const response = await fetch(requestUrl, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${input.accessToken}`,
				"privy-id-token": input.identityToken,
			},
		});
		if (!response.ok) {
			throw new Error(`Failed to delete comment (${response.status})`);
		}
	}
}

export const commentsService = new CommentsService();
