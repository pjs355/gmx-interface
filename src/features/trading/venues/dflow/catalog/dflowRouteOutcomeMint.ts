import type { RouteLeg } from "@/features/trading/sor/core/sor-types";

/**
 * Outcome SPL mint for a DFlow route leg — matches `useSorLegExecutor` Kalshi branch
 * (`inputMint` / `outputMint` for buys/sells). Uses A/B YES outcome mints only.
 */
export function dflowOutcomeMintForRouteLeg(leg: RouteLeg): string | null {
	if (leg.venue !== "dflow") return null;
	const raw =
		leg.outcome === "A" ? leg.venueMarketIds.dflowYesMintA : leg.venueMarketIds.dflowYesMintB;
	const t = (raw ?? "").trim();
	return t || null;
}
