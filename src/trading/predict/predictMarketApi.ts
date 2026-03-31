import type { Book } from "@predictdotfun/sdk";

export type PredictMarketOutcome = {
	name: string;
	indexSet: number;
	onChainId: string;
	status: string | null;
};

export type PredictMarketDetail = {
	id: number;
	title: string;
	question: string;
	isNegRisk: boolean;
	isYieldBearing: boolean;
	feeRateBps: number;
	tradingStatus: string;
	/** Market lifecycle: REGISTERED | PRICE_PROPOSED | PRICE_DISPUTED | PAUSED | UNPAUSED | RESOLVED | REMOVED */
	status?: string;
	/** Non-null when status is RESOLVED */
	resolution?: { name: string; indexSet: number; onChainId: string; status: "WON" | "LOST" | null } | null;
	decimalPrecision: 2 | 3;
	outcomes: PredictMarketOutcome[];
	conditionId: string;
};

/** Re-export for callers that need the Book type alongside market helpers */
export type { Book };

/**
 * Market + orderbook fetches go through `usePrivateApiClient().getPredict*`
 * (`/api/predict/...` + Bearer) so the browser never sends Predict `x-api-key`.
 */

/** Match outcome token id for YES/NO labels (team names). */
export function predictOutcomeTokenId(
	market: PredictMarketDetail,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string
): string {
	const want = norm(position === "yes" ? yesTeamLabel : noTeamLabel);
	for (const o of market.outcomes ?? []) {
		if (norm(o.name) === want) return o.onChainId;
	}
	if (market.outcomes?.length === 2) {
		const y = norm(yesTeamLabel);
		for (const o of market.outcomes) {
			if (norm(o.name) === y && position === "yes") return o.onChainId;
		}
		const n = norm(noTeamLabel);
		for (const o of market.outcomes) {
			if (norm(o.name) === n && position === "no") return o.onChainId;
		}
		return position === "yes"
			? market.outcomes[0].onChainId
			: market.outcomes[1].onChainId;
	}
	throw new Error("Could not map position to Predict outcome token");
}

function norm(s: string): string {
	return s.trim().toLowerCase();
}
