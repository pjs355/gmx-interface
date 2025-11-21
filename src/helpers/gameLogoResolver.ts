// Reusable resolver for picking a game logo from game-logos by tags, with fallback

// Load all game logos at build time via Vite glob
const logoModules = import.meta.glob(
	"@/assets/game-logos/*.{png,jpg,jpeg,svg,webp}",
	{
		eager: true,
		as: "url",
	}
) as Record<string, string>;

function normalizeTag(value: string): string {
	return value
		.toUpperCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

// Build map of normalized filename -> URL and capture fallback
const logoMap: Record<string, string> = {};
let fallbackLogoUrl: string | null = null;
for (const [path, url] of Object.entries(logoModules)) {
	const fileName = path.split("/").pop() || "";
	const base = fileName.replace(/\.[^.]+$/, "");
	const normalized = normalizeTag(base.replace(/[-_]/g, " "));
	logoMap[normalized] = url;
	if (
		!fallbackLogoUrl &&
		/(^|\/)gaminglogo\.(png|jpe?g|webp|svg)$/i.test(path)
	) {
		fallbackLogoUrl = url;
	}
}

// Add specific mappings for common tag variations
const tagMappings: Record<string, string> = {
	LEAGUE_OF_LEGENDS: "LOL",
	CALL_OF_DUTY: "CALLOFDUTY",
	BATTLEFIELD_6: "BATTLEFIELD",
	GTA_VI: "GTA6",
};

// Apply tag mappings to the logo map
for (const [tagKey, imageKey] of Object.entries(tagMappings)) {
	const imageUrl = logoMap[imageKey];
	if (imageUrl) {
		logoMap[tagKey] = imageUrl;
	}
}

export function resolveLogoByTags(
	tags: string[] | undefined | null
): string | null {
	if (Array.isArray(tags)) {
		for (const raw of tags) {
			if (!raw) continue;
			const key = normalizeTag(String(raw));
			const candidate = logoMap[key];
			if (candidate) return candidate;
		}
	}
	return fallbackLogoUrl;
}

// Server-based resolver for umbrella icons using Firebase Storage
// Constructs URLs for images stored in Firebase Storage with pattern: ic_<umbrellaId>.*
const FIREBASE_STORAGE_BASE_URL =
	"https://firebasestorage.googleapis.com/v0/b/leveluptrades-46ac9.firebasestorage.app/o/umbrellas%2F";

export function resolveUmbrellaIconById(umbrellaId?: string): string | null {
	if (!umbrellaId) return null;

	// Return the most common format first (png), let the component handle fallback
	return `${FIREBASE_STORAGE_BASE_URL}ic_${umbrellaId}.png?alt=media`;
}

// Enhanced resolver with priority: Game logo → Fallback
// Note: Server images are handled at component level with error fallback
export function resolveLogoWithPriority(
	umbrella: any,
	tags: string[] | undefined | null
): string | null {
	// Check for game logo based on tags
	const gameLogo = resolveLogoByTags(tags);
	if (gameLogo) {
		return gameLogo;
	}

	// Fallback to game controller image (already handled by resolveLogoByTags)
	return fallbackLogoUrl;
}

export function collectTagsFromUmbrella(umbrella: any): string[] {
	const collected: string[] = [];
	// Use originalChildren (unfiltered, has all tagIds) if available, otherwise fall back to children
	const children: any[] | undefined = umbrella && ((umbrella as any).originalChildren || (umbrella as any).children);
	if (!Array.isArray(children)) return collected;
	
	for (const child of children) {
		// Support both old 'tags' field (string labels) and new 'tagIds' field
		const tags: string[] | undefined = child && (child as any).tags;
		const tagIds: string[] | undefined = child && (child as any).tagIds;
		
		// Collect from legacy tags field (string labels)
		if (Array.isArray(tags)) {
			for (const t of tags) {
				if (t != null) collected.push(String(t));
			}
		}
		
		// Collect from new tagIds field (note: these are IDs, not labels)
		// The tag lookup will happen via the tag service context
		if (Array.isArray(tagIds)) {
			for (const tagId of tagIds) {
				if (tagId != null) collected.push(String(tagId));
			}
		}
	}
	
	return collected;
}

/**
 * Get tag image URL from umbrella's children's tagIds
 * Looks up tags from the provided tags array and returns the first imageUrl found
 */
export function getTagImageFromUmbrella(
	umbrella: any,
	tags: Array<{ _id: string; label: string; imageUrl?: string }>
): string | null {
	// Use originalChildren (unfiltered, has all tagIds) if available, otherwise fall back to children
	const children: any[] | undefined = umbrella && ((umbrella as any).originalChildren || (umbrella as any).children);
	if (!Array.isArray(children) || children.length === 0) return null;

	// Check all children for tagIds
	for (const child of children) {
		const tagIds: string[] | undefined = child && (child as any).tagIds;
		
		if (Array.isArray(tagIds) && tagIds.length > 0) {
			// Look for tags with imageUrl
			for (const tagId of tagIds) {
				const tag = tags.find((t) => t._id === tagId);
				if (tag?.imageUrl) {
					return tag.imageUrl;
				}
			}
		}
	}

	return null;
}

/**
 * Get tag labels from umbrella's children's tagIds
 * Converts tagIds to actual tag labels for logo resolution
 */
export function getTagLabelsFromUmbrella(
	umbrella: any,
	tags: Array<{ _id: string; label: string; imageUrl?: string }>
): string[] {
	const labels: string[] = [];
	// Use originalChildren (unfiltered, has all tagIds) if available, otherwise fall back to children
	const children: any[] | undefined = umbrella && ((umbrella as any).originalChildren || (umbrella as any).children);
	if (!Array.isArray(children)) return labels;

	for (const child of children) {
		const tagIds: string[] | undefined = child && (child as any).tagIds;
		
		if (Array.isArray(tagIds)) {
			for (const tagId of tagIds) {
				const tag = tags.find((t) => t._id === tagId);
				if (tag?.label) {
					labels.push(tag.label);
				}
			}
		}
		
		// Also collect from legacy tags field
		const legacyTags: string[] | undefined = child && (child as any).tags;
		if (Array.isArray(legacyTags)) {
			labels.push(...legacyTags);
		}
	}

	return labels;
}
