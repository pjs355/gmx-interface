import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface Tag {
	_id: string;
	label: string;
	slug: string;
	imageUrl?: string;
	createdAt: string;
	updatedAt: string;
}

export interface TagPayload {
	label: string;
	slug?: string;
	imageUrl?: string | null;
	bannerImageUrl?: string | null;
}

class TagService {
	// NOTE: URLs are now fetched dynamically via getters to prevent
	// stale URL caching issues that caused production bugs
	private get API_BASE_URL(): string {
		return getPredictionApiBaseUrl();
	}
	private get publicTagsUrl(): string {
		return `${getPredictionApiBaseUrl()}/tags`;
	}
	private get adminTagsUrl(): string {
		return `${getPredictionApiBaseUrl()}/admin/tags`;
	}
	private tagsCache: Tag[] | null = null;

	/**
	 * Fetch all tags from the server
	 */
	async fetchAllTags(): Promise<Tag[]> {
		try {
			if (this.tagsCache && this.tagsCache.length > 0) {
				return this.tagsCache;
			}

			const response = await fetch(this.publicTagsUrl);

			if (!response.ok) {
				throw new Error(
					`HTTP error! status: ${response.status} - ${response.statusText}`
				);
			}

			const apiResponse = await response.json();

			// Handle different possible response formats
			let tags: Tag[];
			if (Array.isArray(apiResponse)) {
				// Direct array response
				tags = apiResponse;
			} else if (apiResponse.success && Array.isArray(apiResponse.data)) {
				// Wrapped in success/data object
				tags = apiResponse.data;
			} else if (Array.isArray(apiResponse.tags)) {
				// Wrapped in tags property
				tags = apiResponse.tags;
			} else {
				console.error("Unexpected API response format:", apiResponse);
				throw new Error("Invalid API response structure");
			}

			this.tagsCache = tags;
			return this.tagsCache;
		} catch (error) {
			console.error("error", error);
			return [];
		}
	}

	/**
	 * Clear the cache (useful after creating/updating tags)
	 */
	clearCache(): void {
		this.tagsCache = null;
	}

	async createTag(payload: TagPayload, accessToken: string): Promise<Tag> {
		if (!accessToken) {
			throw new Error("Admin access token required to create tag");
		}
		const response = await fetch(this.adminTagsUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			const fallbackError = `Failed to create tag (${response.status})`;
			const json = await response.json().catch(() => undefined);
			if (!json) {
				throw new Error(fallbackError);
			}
			const extractedError =
				typeof (json as any).error === "string"
					? (json as any).error
					: fallbackError;
			throw new Error(extractedError);
		}
		const tag = await response.json();
		this.clearCache();
		return tag as Tag;
	}

	async updateTag(
		id: string,
		payload: TagPayload,
		accessToken: string
	): Promise<Tag> {
		if (!accessToken) {
			throw new Error("Admin access token required to update tag");
		}
		const url = `${this.adminTagsUrl}/${id}`;
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			const fallbackError = `Failed to update tag (${response.status})`;
			const json = await response.json().catch(() => undefined);
			if (!json) {
				throw new Error(fallbackError);
			}
			const extractedError =
				typeof (json as any).error === "string"
					? (json as any).error
					: fallbackError;
			throw new Error(extractedError);
		}
		const tag = await response.json();
		this.clearCache();
		return tag as Tag;
	}

	async deleteTag(id: string, accessToken: string): Promise<void> {
		if (!accessToken) {
			throw new Error("Admin access token required to delete tag");
		}
		const url = `${this.adminTagsUrl}/${id}`;
		const response = await fetch(url, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		});
		if (!response.ok) {
			const fallbackError = `Failed to delete tag (${response.status})`;
			const json = await response.json().catch(() => undefined);
			if (!json) {
				throw new Error(fallbackError);
			}
			const extractedError =
				typeof (json as any).error === "string"
					? (json as any).error
					: fallbackError;
			throw new Error(extractedError);
		}
		this.clearCache();
	}
}

export const tagService = new TagService();
export default TagService;
