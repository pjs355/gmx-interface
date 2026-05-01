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

	const { active, winnings, history } = useMemo(() => {
		const a: VenuePosition[] = [];
		const w: VenuePosition[] = [];
		const h: VenuePosition[] = [];
		for (const pos of all) {
			if (pos.marketStatus === "FINALIZED") {
				if (pos.outcomeResult === "WON") w.push(pos);
				else h.push(pos);
			} else {
				a.push(pos);
			}
		}
		return { active: a, winnings: w, history: h };
	}, [all]);

	return { all, active, winnings, history, positionsQuery, dflowRpcEnabled };
}
