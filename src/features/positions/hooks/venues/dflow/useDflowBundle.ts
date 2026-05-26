import { useEffect, useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";
import type { AccountDflowProofSlice, AccountPositionsSlice } from "@/context/AccountDataContext";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { accountPositionsQueryShim } from "../accountPositionsQueryShim";

export type UseDflowBundleArgs = {
	solanaAddress: string | null | undefined;
	authenticated: boolean;
	/** DFlow venue slice from `useAccountData()` — passed in so this module never calls `useAccountData` (avoids duplicate `AccountDataContext` module under Vite chunking). */
	dflow: AccountPositionsSlice;
	dflowProof: AccountDflowProofSlice;
};

export type UseDflowBundleResult = {
	all: VenuePosition[];
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
	positionsQuery: UseQueryResult<VenuePosition[], unknown>;
	dflowRpcEnabled: boolean;
};

export function useDflowBundle({
	solanaAddress,
	authenticated,
	dflow,
	dflowProof,
}: UseDflowBundleArgs): UseDflowBundleResult {
	const solanaLinked = Boolean(solanaAddress?.trim());

	const dflowRpcEnabled =
		solanaLinked && Boolean(authenticated) && dflowProof.isFetched && dflowProof.isVerified;

	const all = dflow.rows;

	const positionsQuery = useMemo(
		() => accountPositionsQueryShim(dflow, all, dflowRpcEnabled),
		[dflow, all, dflowRpcEnabled],
	);

	useEffect(() => {
		if (!import.meta.env.DEV || !isTradingDebugLoggingEnabled()) return;
		console.log("[DFlow positions][Positions UI] gate", {
			dflowRpcEnabled,
			solanaLinked,
			authenticated,
			proofFetched: dflowProof.isFetched,
			proofVerified: dflowProof.isVerified,
			sliceStatus: dflow.status,
			isFetched: dflow.isFetched,
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
		dflow.isFetched,
		dflow.status,
		solanaLinked,
	]);

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
