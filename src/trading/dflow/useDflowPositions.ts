import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { createSolanaConnectionForJsonRpcReads } from "@/config/rpc";
import type { PrivateApiClient } from "@/services/privateApi";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	fetchToken2022BalancesForMints,
	matchTokensToMarkets,
	buildCostMap,
	buildDflowHistoryFillsByMint,
	buildGhostDflowMarketPositions,
	collectOutcomeMintCandidatesFromTrades,
	toVenuePositions,
} from "./dflowPositionsApi";

const connection = createSolanaConnectionForJsonRpcReads();

/*
 * DFlow positions React Query — maintainers
 * -----------------------------------------
 * Entry: `usePositionsData` enables this only when Kalshi/DFlow proof is verified
 * (`dflowRpcEnabled`). Query key: `["dflow-positions", solanaAddress]`.
 *
 * Data flow (keep in sync with `dflowPositionsApi` header):
 *   1) Private API: `getDflowOnchainTrades` (paginated) — source of mint list + cost + fills.
 *   2) Private API: `postDflowFilterOutcomeMints` — restrict to DFlow outcome mints.
 *   3) Parallel: `fetchToken2022BalancesForMints` (Solana) + `postDflowMarketsBatch` (metadata).
 *   4) Pure transforms: matchTokensToMarkets, ghosts from fills, `toVenuePositions`.
 *
 * Reliability: `retry: 1`, bounded Solana timeouts inside `dflowPositionsApi`. On unexpected
 * throw in `queryFn`, return `[]` so the query settles and Positions shell does not stick
 * pending (other venues still render).
 *
 * UX coupling: `usePositionsData` exposes `positionsShellBypassMaxWaitMs` — while this query
 * is `isPending` and DFlow RPC is enabled, Positions waits 10s before bypassing the shell
 * (vs 5s for non-DFlow-pending states). Align any gate changes with `positionsShellBlockers`.
 */
export function useDflowPositions(
	solanaAddress: string | null | undefined,
	api: PrivateApiClient,
	options?: { enabled?: boolean }
) {
	const owner = useMemo(
		() =>
			solanaAddress ? safePublicKey(solanaAddress) : null,
		[solanaAddress]
	);

	const extraEnabled = options?.enabled ?? true;

	return useQuery<VenuePosition[]>({
		queryKey: ["dflow-positions", solanaAddress?.trim() ?? null],
		enabled: Boolean(owner) && extraEnabled,
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		retry: 1,
		retryDelay: 2_000,
		queryFn: async () => {
			if (!owner || !solanaAddress) return [];

			try {
				const debugPerf =
					import.meta.env.DEV && import.meta.env.VITE_DEBUG_DFLOW_PERF === "1";
				const t0 = debugPerf ? performance.now() : 0;
				const mark = (label: string) => {
					if (debugPerf) {
						console.log(
							`[DFlowPerf] ${label}: ${(performance.now() - t0).toFixed(0)}ms`,
						);
					}
				};

				const trades = await api.getDflowOnchainTrades(solanaAddress);
				mark("onchainTrades");

				const tradeMintCandidates = collectOutcomeMintCandidatesFromTrades(trades);
				const outcomeMints =
					tradeMintCandidates.length > 0
						? await api.postDflowFilterOutcomeMints(tradeMintCandidates)
						: [];
				mark("filterOutcomeMints");

				if (outcomeMints.length === 0) return [];

				const outcomeMintsDeduped = [...new Set(outcomeMints)];

				const [tokens, markets] = await Promise.all([
					fetchToken2022BalancesForMints(connection, owner, outcomeMintsDeduped),
					api.postDflowMarketsBatch(outcomeMintsDeduped),
				]);
				mark("tokenBalancesAndMarketsBatch");

				const outcomeMintSet = new Set(outcomeMintsDeduped);
				const outcomeTokens = tokens.filter((t) => outcomeMintSet.has(t.mint));
				const matched = matchTokensToMarkets(outcomeTokens, markets);
				const costMap = buildCostMap(trades);
				const fillsByMint = buildDflowHistoryFillsByMint(trades);

				const matchedMints = new Set(matched.map((p) => p.mint));
				const ghostMints = outcomeMintsDeduped.filter((m) => {
					if (matchedMints.has(m)) return false;
					return fillsByMint.has(m) || costMap.has(m);
				});
				const ghosts = buildGhostDflowMarketPositions(ghostMints, markets);
				const positions = [...matched, ...ghosts];

				const out = toVenuePositions(positions, costMap, fillsByMint);
				mark("mapToVenuePositions");
				return out;
			} catch (err) {
				if (import.meta.env.DEV) {
					// eslint-disable-next-line no-console -- DFlow load diagnostic
					console.error("[DFlow] useDflowPositions queryFn failed; returning empty rows", err);
				}
				return [];
			}
		},
	});
}

function safePublicKey(address: string): PublicKey | null {
	try {
		return new PublicKey(address);
	} catch {
		return null;
	}
}
