/**
 * Imperative ref surface for Playwright / TradeBoxTest automation.
 *
 * Exposes `setPosition`, `setAmount`, `setSide`, `executeTrade`, etc. on
 * `PredictionMarketTradeBox` via `forwardRef`. `executeTrade` kicks SOR through
 * `handleSorExecuteRef` (late-bound from controller) — it does not await completion.
 *
 * Keep test-only behavior here; production UI uses props/callbacks instead.
 */
import { useImperativeHandle, type MutableRefObject } from "react";
import {
	userMessage,
	TRADE_ALREADY_PROCESSING,
	TRADE_INSUFFICIENT_SHARES,
	TRADE_MISSING_FIELDS,
	TRADE_NOT_AUTHENTICATED,
	TRADE_NO_WALLET,
	TRADE_SOR_NOT_READY,
} from "@/errors";
import { checkSufficientShares } from "../checkBalances";
import type { TradeBoxCoreState } from "../types";
import type { PredictionMarketTradeBoxHandle } from "../types";

export function useTradeBoxImperativeHandle(
	ref: React.ForwardedRef<PredictionMarketTradeBoxHandle>,
	args: {
		state: TradeBoxCoreState;
		authenticated: boolean;
		account: string | undefined;
		yesBalance: number;
		noBalance: number;
		smartRoutingSurfaceActive: boolean;
		handlePositionChange: (position: "yes" | "no") => void;
		handleAmountChange: (amount: string) => void;
		handlePriceChange: (price: string) => void;
		handleOrderTypeChange: (orderType: "market" | "limit") => void;
		handleSideChange: (side: "buy" | "sell") => void;
		handleTradingVenueChange: (
			venue: "all" | "levelup" | "polymarket" | "predictfun" | "dflow" | "limitless",
		) => void;
		handleSorExecuteRef: MutableRefObject<(() => void) | null>;
	},
): void {
	const {
		state,
		authenticated,
		account,
		yesBalance,
		noBalance,
		smartRoutingSurfaceActive,
		handlePositionChange,
		handleAmountChange,
		handlePriceChange,
		handleOrderTypeChange,
		handleSideChange,
		handleTradingVenueChange,
		handleSorExecuteRef,
	} = args;

	useImperativeHandle(
		ref,
		() => ({
			setPosition: (position: "yes" | "no") => {
				handlePositionChange(position);
			},
			setAmount: (amount: string) => {
				handleAmountChange(amount);
			},
			setPrice: (price: string) => {
				handlePriceChange(price);
			},
			setOrderType: (orderType: "market" | "limit") => {
				handleOrderTypeChange(orderType);
			},
			setSide: (side: "buy" | "sell") => {
				handleSideChange(side);
				if (side === "sell" && smartRoutingSurfaceActive) {
					handleTradingVenueChange("all");
				}
			},
			executeTrade: async () => {
				if (!authenticated) {
					throw new Error(userMessage(TRADE_NOT_AUTHENTICATED));
				}
				if (!account) {
					throw new Error(userMessage(TRADE_NO_WALLET));
				}
				if (state.isLoading) {
					throw new Error(userMessage(TRADE_ALREADY_PROCESSING));
				}
				if (
					!state.selectedPosition ||
					!state.amount ||
					(state.orderType === "limit" && !state.price)
				) {
					throw new Error(userMessage(TRADE_MISSING_FIELDS));
				}

				if (state.side === "sell") {
					const sharesCheck = checkSufficientShares(
						state.amount,
						state.orderType,
						state.side,
						state.selectedPosition,
						yesBalance,
						noBalance,
						null,
					);
					if (!sharesCheck.hasSufficientShares) {
						throw new Error(userMessage(TRADE_INSUFFICIENT_SHARES));
					}
				}

				const runSor = handleSorExecuteRef.current;
				if (!runSor) {
					throw new Error(userMessage(TRADE_SOR_NOT_READY));
				}
				runSor();
			},
			getState: () => state,
		}),
		[
			handlePositionChange,
			handleAmountChange,
			handlePriceChange,
			handleOrderTypeChange,
			handleSideChange,
			handleTradingVenueChange,
			smartRoutingSurfaceActive,
			state,
			authenticated,
			account,
			yesBalance,
			noBalance,
		],
	);
}
