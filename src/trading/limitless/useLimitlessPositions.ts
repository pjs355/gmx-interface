import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { LIMITLESS_QUERY_ROOT } from "./limitlessQueryKeys";
import { debugLimitlessPortfolio } from "./limitlessPortfolioDebug";

function sharesForToken(data: unknown, tokenId: string): number | null {
	if (!tokenId || !Array.isArray(data)) return null;
	for (const row of data) {
		if (!row || typeof row !== "object") continue;
		const o = row as Record<string, unknown>;
		if (String(o.tokenId ?? "") !== tokenId) continue;
		const s = Number(o.shares);
		return Number.isFinite(s) ? s : null;
	}
	return null;
}

/**
 * Fetches Limitless outcome positions from the private API for sell checks.
 */
export function useLimitlessPositions(enabled: boolean) {
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: [...LIMITLESS_QUERY_ROOT, "positions"],
		enabled,
		queryFn: async () => {
			const raw = await api.getLimitlessPositions();
			if (import.meta.env.DEV) {
				const n = Array.isArray(raw) ? raw.length : 0;
				debugLimitlessPortfolio("GET positions (slim / trade-box sell path)", {
					rowCount: n,
					sample:
						Array.isArray(raw) && raw[0] && typeof raw[0] === "object"
							? Object.keys(raw[0] as object).slice(0, 20)
							: [],
				});
			}
			return raw;
		},
		staleTime: 15_000,
	});
}

export function limitlessSharesForToken(
	queryData: unknown,
	tokenId: string | null,
): number | null {
	if (!tokenId) return null;
	return sharesForToken(queryData, tokenId);
}
