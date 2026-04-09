import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/config/rpc";
import type { PrivateApiClient } from "@/services/privateApi";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	fetchWalletToken2022Accounts,
	matchTokensToMarkets,
	buildCostMap,
	toVenuePositions,
} from "./dflowPositionsApi";

const connection = new Connection(SOLANA_RPC_URL, "confirmed");

/**
 * Fetches all DFlow prediction-market positions for a Solana wallet.
 *
 * Pipeline:
 *   1. Read Token-2022 accounts from Solana RPC
 *   2. POST /filter_outcome_mints to identify DFlow mints
 *   3. POST /markets/batch for metadata + live prices
 *   4. GET /onchain-trades for cost basis
 *   5. Map to VenuePosition[]
 *
 * Mirrors `usePolymarketPositions` / `usePredictPositions` patterns.
 *
 * Pass `enabled: false` when Kalshi/Proof is not verified — no DFlow trades are possible,
 * so Solana RPC + on-chain trade fetches can be skipped.
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
		queryKey: ["dflow-positions", solanaAddress ?? null],
		enabled: Boolean(owner) && extraEnabled,
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		queryFn: async () => {
			if (!owner || !solanaAddress) return [];

			const debugPerf = import.meta.env.DEV && import.meta.env.VITE_DEBUG_DFLOW_PERF === "1";
			const t0 = debugPerf ? performance.now() : 0;
			const mark = (label: string) => {
				if (debugPerf) {
					console.log(
						`[DFlowPerf] ${label}: ${(performance.now() - t0).toFixed(0)}ms`,
					);
				}
			};

			const tokens = await fetchWalletToken2022Accounts(connection, owner);
			mark("tokenAccounts");
			if (tokens.length === 0) return [];

			const allMints = tokens.map((t) => t.mint);
			const outcomeMints = await api.postDflowFilterOutcomeMints(allMints);
			mark("filterOutcomeMints");
			const outcomeTokens = tokens.filter((t) =>
				outcomeMints.includes(t.mint)
			);
			if (outcomeTokens.length === 0) return [];

			const [markets, trades] = await Promise.all([
				api.postDflowMarketsBatch(outcomeMints),
				api.getDflowOnchainTrades(solanaAddress),
			]);
			mark("marketsBatch+onchainTrades");

			const matched = matchTokensToMarkets(outcomeTokens, markets);
			const costMap = buildCostMap(trades);
			const out = toVenuePositions(matched, costMap);
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
