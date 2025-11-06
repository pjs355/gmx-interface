import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

export interface Tag {
	_id: string;
	label: string;
	slug: string;
	imageUrl?: string;
	createdAt: string;
	updatedAt: string;
}

interface TagsApiResponse {
	success: boolean;
	data: Tag[];
}

class TagService {
	private readonly API_BASE_URL = getPredictionApiBaseUrl();
	private tagsCache: Tag[] | null = null;

	/**
	 * Fetch all tags from the server
	 */
	async fetchAllTags(accessToken?: string): Promise<Tag[]> {
		try {
			if (this.tagsCache && this.tagsCache.length > 0) {
				return this.tagsCache;
			}

			const headers: Record<string, string> = {};
			if (accessToken) {
				headers.Authorization = `Bearer ${accessToken}`;
			}

			const response = await fetch(`${this.API_BASE_URL}/admin/tags`, {
				headers,
			});

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
}

export const tagService = new TagService();
export default TagService;

