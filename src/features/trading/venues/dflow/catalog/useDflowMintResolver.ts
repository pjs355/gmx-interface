import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { SOLANA_USDC_MINT } from "@/config/addresses";
import type { DflowMarketAccountInfo, DflowEventWire } from "@/services/privateApi";

export type DflowMintPair = {
	yesMint: string;
	noMint: string;
};

const PAGE_LIMIT = 200;
const MAX_PAGES = 5;

/**
 * Extract yesMint/noMint from a market's accounts map.
 * Prefer the USDC collateral entry by key; fall back to first entry.
 */
function extractMintPair(accounts: Record<string, DflowMarketAccountInfo>): DflowMintPair | null {
	const entry = accounts[SOLANA_USDC_MINT] ?? Object.values(accounts)[0];
	if (!entry) return null;
	return { yesMint: entry.yesMint, noMint: entry.noMint };
}

/**
 * Walk an events page looking for the target event + market ticker.
 */
function findMintInEvents(
	events: DflowEventWire[],
	eventTicker: string,
	marketTicker: string,
): DflowMintPair | null {
	for (const event of events) {
		if (event.ticker !== eventTicker) continue;
		if (!Array.isArray(event.markets)) continue;

		for (const mkt of event.markets) {
			if (mkt.ticker !== marketTicker) continue;
			if (!mkt.accounts || typeof mkt.accounts !== "object") continue;
			return extractMintPair(mkt.accounts);
		}
	}
	return null;
}

/**
 * Resolves a DFlow market ticker to Solana SPL `yesMint` / `noMint` addresses
 * via the DFlow Metadata API (proxied at `GET /api/dflow/events`).
 *
 * Cached aggressively -- mints don't change once a market exists.
 */
export function useDflowMintResolver(
	eventTicker: string | null | undefined,
	marketTicker: string | null | undefined,
) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();

	return useQuery<DflowMintPair | null>({
		queryKey: ["dflow", "mint-resolve", eventTicker ?? "", marketTicker ?? ""],
		queryFn: async () => {
			if (!eventTicker || !marketTicker) return null;

			let cursor: number | undefined;

			for (let page = 0; page < MAX_PAGES; page++) {
				const params: Record<string, string> = {
					withNestedMarkets: "true",
					limit: String(PAGE_LIMIT),
				};
				if (cursor != null) {
					params.cursor = String(cursor);
				}

				const resp = await api.getDflowEvents(params);

				const result = findMintInEvents(resp.events ?? [], eventTicker, marketTicker);
				if (result) return result;

				if (resp.cursor == null) break;
				cursor = resp.cursor;
			}

			return null;
		},
		enabled: authenticated && Boolean(eventTicker) && Boolean(marketTicker),
		staleTime: 30 * 60_000,
		gcTime: 60 * 60_000,
	});
}
