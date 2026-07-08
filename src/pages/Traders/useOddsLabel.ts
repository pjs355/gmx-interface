import { useOddsDisplayOptional } from "@/context/OddsDisplayContext";

/**
 * Format an implied probability (entry price, or a combo's stake/payout
 * ratio) in the user's app-wide odds style. The site default ("Price ¢")
 * shows cents (62¢); every other style goes through the shared avg-odds
 * formatter (American, decimal, …). Single source of truth for every
 * odds label on the Traders surfaces — including what used to render as
 * a bare "2x" multiple.
 */
export function useOddsLabel(): (impliedProb: number) => string {
	const odds = useOddsDisplayOptional();
	return (p: number) => {
		if (!Number.isFinite(p) || p <= 0 || p >= 1) return "";
		if (odds.oddsDisplayStyle === "default") return odds.formatPrice(p);
		return odds.formatAvgOdds(p);
	};
}
