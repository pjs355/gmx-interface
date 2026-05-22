import { useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
	useSorRoute,
	SOR_ROUTE_DEBOUNCE_MS,
	type UseSorRouteInput,
	type UseSorRouteResult,
} from "@/trading/sor/useSorRoute";
import { deriveSorRouteAmountFromInput } from "./deriveSorRouteAmount";

export { SOR_ROUTE_DEBOUNCE_MS as TRADE_BOX_QUOTE_DEBOUNCE_MS };

type SorRouteInput = Omit<
	UseSorRouteInput,
	"amount" | "amountDebounceMs" | "includeDflowPondQuote"
>;

export type UseTradeBoxQuotesArgs = {
	/** Live typed amount (`state.amount`) — debounced once inside this hook. */
	amount: string;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	limitPriceCents: number | null | undefined;
	maxScopedSellShares: number;
	sorRoute: SorRouteInput;
	/** Bundled Pond preview on POST /api/sor/route (replaces separate `/order/quote`). */
	includeDflowPondQuote: boolean;
};

export type UseTradeBoxQuotesResult = {
	/** Amount string after {@link TRADE_BOX_QUOTE_DEBOUNCE_MS} — drives SOR (and Pond when bundled). */
	debouncedAmount: string;
	/** SOR numeric amount derived from `debouncedAmount`. */
	sorAmountUsd: number;
	sorRoute: UseSorRouteResult;
};

/**
 * Single debounce for trade-box pricing: SOR route (+ optional bundled DFlow Pond
 * quote on the same POST). Fires after the same quiet period (300ms).
 */
export function useTradeBoxQuotes(args: UseTradeBoxQuotesArgs): UseTradeBoxQuotesResult {
	const debouncedAmount = useDebouncedValue(
		args.amount ?? "",
		SOR_ROUTE_DEBOUNCE_MS,
	);

	const deriveOpts = useMemo(
		() => ({
			side: args.side,
			orderType: args.orderType,
			limitPriceCents: args.limitPriceCents,
			maxScopedSellShares: args.maxScopedSellShares,
		}),
		[
			args.side,
			args.orderType,
			args.limitPriceCents,
			args.maxScopedSellShares,
		],
	);

	const sorAmountUsd = useMemo(
		() =>
			deriveSorRouteAmountFromInput({
				amount: debouncedAmount,
				...deriveOpts,
			}),
		[debouncedAmount, deriveOpts],
	);

	const sorRoute = useSorRoute({
		...args.sorRoute,
		amount: sorAmountUsd,
		amountDebounceMs: 0,
		includeDflowPondQuote: args.includeDflowPondQuote,
	});

	return {
		debouncedAmount,
		sorAmountUsd,
		sorRoute,
	};
}
