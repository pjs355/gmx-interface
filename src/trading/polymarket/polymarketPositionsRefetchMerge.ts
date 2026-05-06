/**
 * Normalizes Polymarket Data API `asset` / outcome token ids for stable comparison.
 */
export function normalizePolymarketPositionTokenId(
	tokenId: string | undefined | null,
): string {
	if (tokenId == null) return "";
	const s = String(tokenId).trim();
	if (!s) return "";
	try {
		return BigInt(s).toString();
	} catch {
		return s.toLowerCase();
	}
}
