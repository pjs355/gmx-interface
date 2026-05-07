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
	 * Fetch all tags from the server.
	 *
	 * Throws on network/parse failure rather than returning `[]`. The previous
	 * silent `[]` swallow made the tag-filter UI look broken (visible chips
	 * vanished without explanation). Callers should handle the throw — see
	 * `PredictionDataContext` which now sets `tagsError: true` so the UI can
	 * decide whether to retry or hide the filter.
	 */
	async fetchAllTags(): Promise<Tag[]> {
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

		let tags: Tag[];
		if (Array.isArray(apiResponse)) {
			tags = apiResponse;
		} else if (apiResponse.success && Array.isArray(apiResponse.data)) {
			tags = apiResponse.data;
		} else if (Array.isArray(apiResponse.tags)) {
			tags = apiResponse.tags;
		} else {
			console.error("[tagService] Unexpected API response format:", apiResponse);
			throw new Error("Invalid API response structure for /tags");
		}

		this.tagsCache = tags;
		return this.tagsCache;
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
