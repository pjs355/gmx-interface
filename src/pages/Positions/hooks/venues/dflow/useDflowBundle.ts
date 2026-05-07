import { useEffect, useMemo } from "react";
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
	 * DFlow rows from disappearing under their own latency budget.
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

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		console.log("[DFlow positions][Positions UI] gate", {
			dflowRpcEnabled,
			solanaLinked,
			authenticated,
			proofFetched: dflowProof.isFetched,
			proofVerified: dflowProof.isVerified,
			queryStatus: positionsQuery.status,
			fetchStatus: positionsQuery.fetchStatus,
			isPending: positionsQuery.isPending,
			isFetched: positionsQuery.isFetched,
			rowCount: all.length,
		});
		console.log(
			"[DFlow positions][Positions UI] RAW (useDflowBundle.all — same rows fed into umbrella assembly)",
			all,
		);
	}, [
		all,
		authenticated,
		dflowProof.isFetched,
		dflowProof.isVerified,
		dflowRpcEnabled,
		positionsQuery.fetchStatus,
		positionsQuery.isFetched,
		positionsQuery.isPending,
		positionsQuery.status,
		solanaLinked,
	]);

	/**
	 * Routing rules (mirrors how the rest of the Positions page interprets venues):
	 *   - WON  + shares > 0       → winnings (claimable; rendered with a Claim button)
	 *   - WON  + shares ≤ 0       → history  (already redeemed/closed; would phantom-block in winnings)
	 *   - LOST                    → history
	 *   - open + shares > epsilon → active   (currently held, open / pending settlement)
	 *   - open + shares ≤ epsilon → dropped  (ghost rows from `useDflowPositions` exist purely to
	 *                                          carry past fills/cost into History once a market
	 *                                          finalizes — they must NOT show up on the Positions
	 *                                          tab while the market is still open.)
	 *
	 * Do **not** push rows to history on `isVenueMarketResolvedLike` alone: DFlow `CLOSED` means
	 * trading ended but the outcome may still be pending — the user still holds outcome tokens and
	 * must see them under Positions. Only explicit `LOST` (or `WON` with zero shares) belongs in history.
	 *
	 * Why the `shares > 0.0001` gate on `active`: DFlow `useDflowPositions` intentionally emits
	 * zero-balance "ghost" `VenuePosition`s for mints the user previously held (so cost/fills carry
	 * forward). Without this filter, a market the user fully sold out of stays on the Positions tab
	 * until DFlow flips its `status` to `finalized` — sometimes hours or days late. Mirrors the
	 * `mapPredictPositionRows` `> 0.0001` epsilon.
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
			} else if (pos.shares > 0.0001) {
				a.push(pos);
			}
		}
		return { active: a, winnings: w, history: h };
	}, [all]);

	return { all, active, winnings, history, positionsQuery, dflowRpcEnabled };
}
