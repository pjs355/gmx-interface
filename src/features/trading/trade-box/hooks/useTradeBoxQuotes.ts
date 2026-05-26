import { useMemo } from "react";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import {
	useSorRoute,
	SOR_ROUTE_DEBOUNCE_MS,
	type UseSorRouteInput,
	type UseSorRouteResult,
} from "@/features/trading/sor/core/useSorRoute";
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
	/** Ask server to fetch Pond for DFlow overlay (all tab + dflow tab). */
	includeDflowPondQuote: boolean;
};

export type UseTradeBoxQuotesResult = {
	/** Amount string after {@link TRADE_BOX_QUOTE_DEBOUNCE_MS} — drives SOR. */
	debouncedAmount: string;
	/** SOR numeric amount derived from `debouncedAmount`. */
	sorAmountUsd: number;
	sorRoute: UseSorRouteResult;
};

/**
 * Single debounce for trade-box pricing: SOR route (Pond economics are folded
 * into the DFlow leg on the server when applicable).
 *
 * When `sorRoute.walletBalances` is omitted (logged-out / not hydrated), the API
 * still returns book-based routes; smart-routing rows may use `quoteKind: "theoreticalOnly"`.
 */
export function useTradeBoxQuotes(args: UseTradeBoxQuotesArgs): UseTradeBoxQuotesResult {
	const debouncedAmount = useDebouncedValue(args.amount ?? "", SOR_ROUTE_DEBOUNCE_MS);

	const deriveOpts = useMemo(
		() => ({
			side: args.side,
			orderType: args.orderType,
			limitPriceCents: args.limitPriceCents,
			maxScopedSellShares: args.maxScopedSellShares,
		}),
		[args.side, args.orderType, args.limitPriceCents, args.maxScopedSellShares],
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
