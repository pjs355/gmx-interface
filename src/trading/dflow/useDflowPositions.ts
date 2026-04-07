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
 */
export function useDflowPositions(
	solanaAddress: string | null | undefined,
	api: PrivateApiClient
) {
	const owner = useMemo(
		() =>
			solanaAddress ? safePublicKey(solanaAddress) : null,
		[solanaAddress]
	);

	return useQuery<VenuePosition[]>({
		queryKey: ["dflow-positions", solanaAddress ?? null],
		enabled: Boolean(owner),
		staleTime: 60_000,
		gcTime: 5 * 60_000,
		queryFn: async () => {
			if (!owner || !solanaAddress) return [];

			const tokens = await fetchWalletToken2022Accounts(connection, owner);
			if (tokens.length === 0) return [];

			const allMints = tokens.map((t) => t.mint);
			const outcomeMints = await api.postDflowFilterOutcomeMints(allMints);
			const outcomeTokens = tokens.filter((t) =>
				outcomeMints.includes(t.mint)
			);
			if (outcomeTokens.length === 0) return [];

			const [markets, trades] = await Promise.all([
				api.postDflowMarketsBatch(outcomeMints),
				api.getDflowOnchainTrades(solanaAddress),
			]);

			const matched = matchTokensToMarkets(outcomeTokens, markets);
			const costMap = buildCostMap(trades);
			return toVenuePositions(matched, costMap);
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
