// Fuzzy string matching utilities for auto-selecting tags

export interface MatchableTag {
	_id: string;
	label: string;
	slug: string;
}

// Calculate similarity between two strings (0-100%)
export function calculateSimilarity(str1: string, str2: string): number {
	const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, "");
	const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, "");

	if (s1 === s2) return 100;
	if (s1.includes(s2) || s2.includes(s1)) return 90;

	// Levenshtein distance-based similarity
	const longer = s1.length > s2.length ? s1 : s2;
	const shorter = s1.length > s2.length ? s2 : s1;

	if (longer.length === 0) return 100;

	const editDistance = levenshteinDistance(longer, shorter);
	const similarity = ((longer.length - editDistance) / longer.length) * 100;

	return Math.round(similarity);
}

function levenshteinDistance(str1: string, str2: string): number {
	const matrix: number[][] = [];

	for (let i = 0; i <= str2.length; i++) {
		matrix[i] = [i];
	}

	for (let j = 0; j <= str1.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= str2.length; i++) {
		for (let j = 1; j <= str1.length; j++) {
			if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j] + 1,
				);
			}
		}
	}

	return matrix[str2.length][str1.length];
}

export function findMatchingTag(
	gameName: string,
	tags: MatchableTag[],
	threshold = 85,
): string | null {
	if (!gameName || !tags.length) return null;

	let bestMatch: { tag: MatchableTag; score: number } | null = null;

	for (const tag of tags) {
		const labelScore = calculateSimilarity(gameName, tag.label);
		const slugScore = calculateSimilarity(gameName, tag.slug);
		const bestScore = Math.max(labelScore, slugScore);

		if (bestScore >= threshold) {
			if (!bestMatch || bestScore > bestMatch.score) {
				bestMatch = { tag, score: bestScore };
			}
		}
	}

	return bestMatch ? bestMatch.tag._id : null;
}
