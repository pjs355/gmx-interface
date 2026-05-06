import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { usePredictionData } from "context/PredictionDataContext";
import type { PrivateApiClient } from "@/services/privateApi";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	buildDflowPortfolioColumnMapFromCatalog,
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
	collectAllDflowCatalogWireMints,
	expandDflowMintsWithCoListedLegs,
	stableDflowUmbrellaMintCatalogSig,
} from "@/trading/dflow/dflowUmbrellaLookup";
import {
	matchTokensToMarkets,
	marketPositionsForUnmatchedTokens,
	buildCostMap,
	buildDflowHistoryFillsByMint,
	buildGhostDflowMarketPositions,
	collectOutcomeMintCandidatesFromTrades,
	patchDflowVenuePositionOutcomes,
	toVenuePositions,
} from "./dflowPositionsApi";
import {
	acknowledgeDflowOutcomeMintBalanceSeen,
	getPendingDflowOutcomeMintsForMerge,
} from "./pendingDflowOutcomeMints";

/*
 * DFlow positions React Query — maintainers
 * -----------------------------------------
 * Entry: `usePositionsData` enables this only when DFlow RPC proof is verified
 * (`dflowRpcEnabled`). Query key: `["dflow-positions", solanaAddress, dflowMintCatalogSig]`.
 *
 * Data flow (keep in sync with `dflowPositionsApi` header):
 *   1) Private API: `getDflowOnchainTrades` (paginated) — source of mint list + cost + fills.
 *   2) `expandDflowMintsWithCoListedLegs` + Private API: `postDflowFilterOutcomeMints` — outcome mints;
 *      includes all four outcome leg mints for any umbrella whose wire touches a trade mint.
 *   3) Private API: `postDflowTokenBalances` (server `SOLANA_RPC_URL` only) + `postDflowMarketsBatch` (metadata).
 *   4) Pure transforms: matchTokensToMarkets, ghosts from fills, `toVenuePositions`.
 *   5) `select`: {@link patchDflowVenuePositionOutcomes} (catalog mint→Yes/No + umbrella {@link portfolioColumnTeamLabels} → `dflowTradeSideLabel`).
 *      Dev **RAW** logs for what Positions consumes: [`useDflowBundle`](LevelUp_Predictions/src/pages/Positions/hooks/venues/dflow/useDflowBundle.ts) (`[DFlow positions][Positions UI]`).
 *      QueryFn still logs network mint coverage / catalog drift in dev when the fetch runs.
 *
 * Reliability: `retry: 1`, bounded timeouts on the server for token reads. On unexpected
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

	const { umbrellas } = usePredictionData();
	const catalogColumnMap = useMemo(
		() => buildDflowPortfolioColumnMapFromCatalog(umbrellas),
		[umbrellas],
	);

	const dflowOutcomeMintToUmbrella = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(umbrellas),
		[umbrellas],
	);

	const dflowEventTickerLookup = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(umbrellas),
		[umbrellas],
	);

	const dflowMintCatalogSig = useMemo(
		() => stableDflowUmbrellaMintCatalogSig(umbrellas),
		[umbrellas],
	);

	const applyCatalogOutcomes = useCallback(
		(rows: VenuePosition[]): VenuePosition[] => {
			return patchDflowVenuePositionOutcomes(rows, catalogColumnMap, {
				outcomeMintToUmbrella: dflowOutcomeMintToUmbrella,
				eventTickerLookup: dflowEventTickerLookup,
				umbrellasForEventLookup: umbrellas,
			});
		},
		[
			catalogColumnMap,
			dflowOutcomeMintToUmbrella,
			dflowEventTickerLookup,
			umbrellas,
		],
	);

	return useQuery<VenuePosition[]>({
		queryKey: [
			"dflow-positions",
			solanaAddress?.trim() ?? null,
			dflowMintCatalogSig,
		],
		enabled: Boolean(owner) && extraEnabled,
		/** Binds passive refetch frequency when nothing invalidates the query (e.g. no trade). Trade success uses `invalidateQueries` so rows refresh immediately — this is not a 60s “refresh after trade” timer. */
		staleTime: 15_000,
		gcTime: 5 * 60_000,
		retry: 1,
		retryDelay: 2_000,
		select: applyCatalogOutcomes,
		queryFn: async () => {
			if (!owner || !solanaAddress) return [];

			// Note: this used to wrap the whole pipeline in a `try { … } catch
			// { return mergeDflowFetchWithFloors(addr, []) }`. That made any
			// failure (Solana RPC outage, DFlow API 5xx, JSON parse) look
			// identical to "user has no DFlow positions". We now let the
			// query throw so React Query records `isError`, the Positions
			// tab can render an explicit "DFlow temporarily unavailable"
			// row, and `useAccountData().positions.dflow.error` is non-null.
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

			const tradeMintCandidates = [
				...new Set([
					...collectOutcomeMintCandidatesFromTrades(trades),
					...getPendingDflowOutcomeMintsForMerge(),
				]),
			];
			const expandedCandidates = expandDflowMintsWithCoListedLegs(
				tradeMintCandidates,
				umbrellas,
			);
			let outcomeMints =
				expandedCandidates.length > 0
					? await api.postDflowFilterOutcomeMints(expandedCandidates)
					: [];
			mark("filterOutcomeMints");

			const pendingOutcomeSeeds = getPendingDflowOutcomeMintsForMerge();
			if (pendingOutcomeSeeds.length > 0) {
				outcomeMints = [...new Set([...outcomeMints, ...pendingOutcomeSeeds])];
			}

			if (outcomeMints.length === 0) {
				return [];
			}

			const outcomeMintsDeduped = [...new Set(outcomeMints)];

			const [tokens, markets] = await Promise.all([
				api.postDflowTokenBalances(solanaAddress, outcomeMintsDeduped),
				api.postDflowMarketsBatch(outcomeMintsDeduped),
			]);
			mark("tokenBalancesAndMarketsBatch");

			for (const tok of tokens) {
				if (tok.balance > 0) {
					acknowledgeDflowOutcomeMintBalanceSeen(tok.mint);
				}
			}

			if (import.meta.env.DEV) {
				const catalogWire = collectAllDflowCatalogWireMints(umbrellas);
				const positive = tokens.filter((t) => t.balance > 0);
				for (const t of positive) {
					const mint = t.mint.trim();
					if (!catalogWire.has(mint)) {
						console.warn(
							"[DFlow positions] Catalog drift: wallet has balance but mint is not on any umbrella exchangeMatching.dflow (yes/no A/B). Update matched-markets / Mongo wire.",
							mint,
						);
					}
				}
				const mintTail = (addr: string) =>
					addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
				console.log(
					"%c[DFlow positions] Network mint coverage",
					"color:#a78bfa;font-weight:bold",
					{
						catalogWireMintCount: catalogWire.size,
						postFilterOutcomeMintCount: outcomeMintsDeduped.length,
						outcomeMintsRequestedTails: outcomeMintsDeduped.map(mintTail),
						tokenBalancesRowCount: tokens.length,
						positiveBalanceTails: positive.map((t) => ({
							mint: mintTail(t.mint),
							balance: t.balance,
							onCatalogWire: catalogWire.has(t.mint.trim()),
						})),
						marketsBatchRowCount: markets.length,
					},
				);
			}

			const outcomeMintSet = new Set(outcomeMintsDeduped);
			const outcomeTokens = tokens.filter((t) => outcomeMintSet.has(t.mint));
			const matched = matchTokensToMarkets(outcomeTokens, markets);
			const costMap = buildCostMap(trades);
			const fillsByMint = buildDflowHistoryFillsByMint(trades);

			const matchedMints = new Set(matched.map((p) => p.mint));
			const recovered = marketPositionsForUnmatchedTokens(
				outcomeTokens,
				matchedMints,
				markets,
			);
			const recoveredMints = new Set(recovered.map((p) => p.mint));

			const tokenByMint = new Map(outcomeTokens.map((t) => [t.mint, t]));
			const ghostMints = outcomeMintsDeduped.filter((m) => {
				if (matchedMints.has(m)) return false;
				if (recoveredMints.has(m)) return false;
				const tok = tokenByMint.get(m);
				if (tok && tok.balance > 0) return false;
				return fillsByMint.has(m) || costMap.has(m);
			});
			const ghosts = buildGhostDflowMarketPositions(ghostMints, markets);
			const positions = [...matched, ...recovered, ...ghosts];

			const out = toVenuePositions(positions, costMap, fillsByMint, markets);
			mark("mapToVenuePositions");
			return out;
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
