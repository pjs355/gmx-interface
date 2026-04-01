import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";

export type DflowMintPair = {
	yesMint: string;
	noMint: string;
};

/**
 * Resolves a Kalshi/DFlow market ticker (e.g. `KXCS2GAME-26APR011200M80MNTE-M80`)
 * to the Solana SPL `yesMint` / `noMint` addresses via the DFlow Metadata API
 * (proxied through the private API at `GET /api/dflow/events`).
 *
 * Cached aggressively — mints don't change once a market exists.
 */
export function useDflowMintResolver(
	eventTicker: string | null | undefined,
	marketTicker: string | null | undefined
) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();

	return useQuery<DflowMintPair | null>({
		queryKey: ["dflow", "mint-resolve", eventTicker ?? "", marketTicker ?? ""],
		queryFn: async () => {
			if (!eventTicker || !marketTicker) return null;

			const resp = await api.getDflowEvents({
				withNestedMarkets: "true",
				status: "active",
				limit: "200",
			});

			for (const event of resp.events ?? []) {
				const ev = event as Record<string, unknown>;
				if (String(ev.ticker ?? "") !== eventTicker) continue;

				const markets = ev.markets as Record<string, unknown>[] | undefined;
				if (!Array.isArray(markets)) continue;

				for (const mkt of markets) {
					if (String(mkt.ticker ?? "") !== marketTicker) continue;
					const accounts = mkt.accounts as Record<
						string,
						{ yesMint?: string; noMint?: string }
					>;
					if (!accounts || typeof accounts !== "object") continue;

					const first = Object.values(accounts)[0];
					if (first?.yesMint && first?.noMint) {
						return { yesMint: first.yesMint, noMint: first.noMint };
					}
				}
			}

			return null;
		},
		enabled: authenticated && Boolean(eventTicker) && Boolean(marketTicker),
		staleTime: 30 * 60_000,
		gcTime: 60 * 60_000,
	});
}
