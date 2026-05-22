import type { PredictMarketDetail } from "@/trading/venues/predict/portfolio/predictMarketApi";
import { normalizePredictTokenId } from "@/trading/venues/predict/portfolio/predictOrdersApi";

/**
 * Map a held outcome token to LevelUp Yes/No buckets using Predict market metadata.
 * Matches {@link predictOutcomeTokenId} fallback: binary `outcomes[0]` → yes, `outcomes[1]` → no.
 */
export function inferPredictSideFromMarketDetail(
	detail: PredictMarketDetail | undefined | null,
	tokenId: string | undefined | null,
): { side: "Yes" | "No"; teamName: string } | null {
	if (!detail?.outcomes?.length || tokenId == null) return null;
	const normTok = normalizePredictTokenId(tokenId);
	if (!normTok) return null;
	const idx = detail.outcomes.findIndex(
		(o) => normalizePredictTokenId(o.onChainId) === normTok,
	);
	if (idx < 0) return null;
	const o = detail.outcomes[idx]!;
	const teamName = (o.name ?? "").trim() || (idx === 0 ? "Yes" : "No");

	if (detail.outcomes.length === 2) {
		return { side: idx === 0 ? "Yes" : "No", teamName };
	}
	if (detail.outcomes.length === 1) {
		return { side: "Yes", teamName };
	}
	return null;
}
