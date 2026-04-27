import { extractVsCore, stripUmbrellaDisplayPrefix } from "@/helpers/umbrellaDisplayName";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { polymarketConditionLookupKey } from "@/trading/polymarket/polymarketConditionLookup";
import { polyOutcomeTokenId } from "@/trading/polymarket/polyOutcomeTokenId";

function normalizePolyTokenId(tokenId: string | undefined | null): string {
	if (tokenId == null) return "";
	const s = String(tokenId).trim();
	if (!s) return "";
	try {
		return BigInt(s).toString();
	} catch {
		return s.toLowerCase();
	}
}

export function findMatchedMarketByPolyConditionId(
	markets: MatchedMarket[] | null | undefined,
	conditionId: string | undefined | null,
): MatchedMarket | null {
	if (!markets?.length || !conditionId?.trim()) return null;
	const key = polymarketConditionLookupKey(conditionId);
	if (!key) return null;
	return (
		markets.find(
			(m) => polymarketConditionLookupKey(String(m.polyConditionId ?? "")) === key,
		) ?? null
	);
}

/**
 * Parse "TeamA vs TeamB" (and optional " - Match Winner") for portfolio Yes/No columns
 * (same convention as {@link PositionsTableView}: first team = Yes).
 */
export function parseVsTeamLabelsFromDisplayTitle(
	title: string | undefined | null,
): { yesTeamLabel: string; noTeamLabel: string } | null {
	if (!title?.trim()) return null;
	const core = extractVsCore(title);
	let t = (core ?? stripUmbrellaDisplayPrefix(title)).trim();
	t = t.replace(/\s*-\s*Match Winner\b.*$/i, "").trim();
	const parts = t
		.split(/\s*vs\.?\s*/i)
		.map((s) => s.trim())
		.filter(Boolean);
	if (parts.length !== 2) return null;
	return { yesTeamLabel: parts[0]!, noTeamLabel: parts[1]! };
}

/**
 * Map a held Polymarket outcome token to LevelUp Yes/No using the odds-monitor row
 * (same mapping as the trade box: {@link polyOutcomeTokenId}).
 */
export function inferPolymarketYesNoFromToken(
	pos: Pick<VenuePosition, "tokenId" | "conditionId">,
	matched: MatchedMarket,
	yesTeamLabel: string,
	noTeamLabel: string,
): { side: "Yes" | "No" } | null {
	const yesTok = polyOutcomeTokenId(matched, "yes", yesTeamLabel, noTeamLabel);
	const noTok = polyOutcomeTokenId(matched, "no", yesTeamLabel, noTeamLabel);
	const p = normalizePolyTokenId(pos.tokenId);
	if (!p) return null;
	if (p === normalizePolyTokenId(yesTok)) return { side: "Yes" };
	if (p === normalizePolyTokenId(noTok)) return { side: "No" };
	return null;
}
