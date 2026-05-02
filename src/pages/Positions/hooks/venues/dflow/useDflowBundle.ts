import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import type { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { VenuePosition } from "@/types/trading/venuePosition";

type PrivateApi = ReturnType<typeof usePrivateApiClient>;

export type UseDflowBundleArgs = {
	solanaAddress: string | null | undefined;
	privateApi: PrivateApi;
	authenticated: boolean;
};

export type UseDflowBundleResult = {
	all: VenuePosition[];
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
	positionsQuery: UseQueryResult<VenuePosition[], unknown>;
	/**
	 * Gate consumed by `useReadinessGates` and the slim `[positions-gate]` log so the
	 * Positions shell waits 10s on a verified DFlow user (vs. 5s) before bypass — keeps
	 * Kalshi/DFlow rows from disappearing under their own latency budget.
	 */
	dflowRpcEnabled: boolean;
};

export function useDflowBundle({
	solanaAddress,
	privateApi,
	authenticated,
}: UseDflowBundleArgs): UseDflowBundleResult {
	const dflowProof = useDflowProofStatus();
	const solanaLinked = Boolean(solanaAddress?.trim());

	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;

	const positionsQuery = useDflowPositions(solanaAddress, privateApi, {
		enabled: dflowRpcEnabled,
	});
	const all = positionsQuery.data ?? [];

	/**
	 * Routing rules (mirrors how the rest of the Positions page interprets venues):
	 *   - WON  + shares > 0  → winnings (claimable; rendered with a Claim button)
	 *   - WON  + shares ≤ 0  → history  (already redeemed/closed; would phantom-block in winnings)
	 *   - LOST                → history
	 *   - everything else     → active (open / pending settlement)
	 *
	 * Do **not** push rows to history on `isVenueMarketResolvedLike` alone: DFlow `CLOSED` means
	 * trading ended but the outcome may still be pending — the user still holds outcome tokens and
	 * must see them under Positions. Only explicit `LOST` (or `WON` with zero shares) belongs in history.
	 *
	 * Why: the user reported a DFlow market they lost popping into the Winnings tab without a
	 * claim button. That can only happen when a `WON` row with 0 shares (post-redemption) flows
	 * through `appendVenueWinnings` and renders an empty umbrella block. Filtering on `shares > 0`
	 * here keeps the contract tight at the source.
	 */
	const { active, winnings, history } = useMemo(() => {
		const a: VenuePosition[] = [];
		const w: VenuePosition[] = [];
		const h: VenuePosition[] = [];
		for (const pos of all) {
			if (pos.outcomeResult === "WON") {
				if (pos.shares > 0) w.push(pos);
				else h.push(pos);
			} else if (pos.outcomeResult === "LOST") {
				h.push(pos);
			} else {
				a.push(pos);
			}
		}
		return { active: a, winnings: w, history: h };
	}, [all]);

	return { all, active, winnings, history, positionsQuery, dflowRpcEnabled };
}
