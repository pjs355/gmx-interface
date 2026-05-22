import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAnimatedDots } from "@/hooks/useAnimatedDots";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import {
	checkRawInputAgainstVenueMinimum,
	getSorBuyCashShortfall,
	parseLimitPriceCents,
	routeFailsVenueMinimums,
	SOR_FLOOR_MESSAGES,
	type RoutePlan,
	type SorExecutionPhase,
	type SorPrefundLegProgress,
} from "@/trading/sor";
import { SHARE_SELL_COMPARE_EPS } from "../../checkBalances";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import type { AccountWalletGate } from "@/context/accountWallets";
import {
	EMPTY_TRADE_PREVIEW,
	type TradePreviewFields,
} from "../../tradeQuote/types";
import type { ButtonStateResult } from "./types";
import {
	userMessage,
	BTN_ENTER_AMOUNT,
	BTN_FETCHING_PRICE,
	BTN_KALSHI_ENABLE_TRADING,
	BTN_KALSHI_LIMIT_NOT_SUPPORTED,
	BTN_LIMITLESS_ESPORTS_NOT_LINKED,
	BTN_LIMITLESS_MARKET_NOT_LINKED,
	BTN_LIMITLESS_NO_MATCHED_MARKET,
	BTN_NO_BIDS_AVAILABLE,
	BTN_NO_SHARES_AVAILABLE,
	BTN_NO_SHARES_TO_SELL,
	BTN_NOT_ENOUGH_BIDS_TO_SELL,
	BTN_NOT_ENOUGH_SHARES,
	BTN_POLY_ESPORTS_NOT_LINKED,
	BTN_POLY_NO_MATCHED_MARKET,
	BTN_POLY_SETUP_REQUIRED,
	BTN_POLY_UNAVAILABLE,
	BTN_PREDICT_ESPORTS_NOT_LINKED,
	BTN_PREDICT_MARKET_IDS_NOT_LINKED,
	BTN_PREDICT_NO_MATCHED_MARKET,
	BTN_REFRESHING_VENUE_PRICES,
	executionNotReadyButtonLabel,
} from "@/errors";

/**
 * Friendly placeholder shown while any of the three background activators
 * (Polymarket / Predict / Limitless) is mid-setup. We swap this in for the
 * "Trading setup required" / "Complete venue setup" / generic loading copy
 * so a brand-new user never sees jargon while we're working in the
 * background. The button stays disabled — they can't trade yet — but the
 * label promises the system is doing something on their behalf.
 */
export const SETUP_IN_PROGRESS_LABEL = "Setting up your account…";

/** Non-onboarding venue/session warm-up (CLOB, relay, etc.). */
export const VENUE_LOADING_LABEL = "Loading…";

/** Caps console noise when `useMemo` recomputes often with the same bad input. */
let missingPooledCashWarnCount = 0;
const MAX_MISSING_POOLED_CASH_WARNS = 3;

type SorStateForDeposit = {
	route: RoutePlan | null;
	isLoading: boolean;
	isStale?: boolean;
	routeExpired: boolean;
	totalAvailableCash?: number;
	handleAddFunds?: () => void;
};

export function trySorDepositToTrade(side: "buy" | "sell", sorState: SorStateForDeposit | undefined): ButtonStateResult | null {
	if (!sorState?.handleAddFunds || side !== "buy" || !sorState.route) return null;

	const gap = getSorBuyCashShortfall(sorState.route, sorState.totalAvailableCash, {
		routeExpired: sorState.routeExpired,
		isLoading: sorState.isLoading,
		isStale: sorState.isStale ?? false,
		side,
	});
	if (!gap) return null;
	return {
		text: "Deposit to Trade",
		disabled: false,
		onClick: sorState.handleAddFunds,
		depositShortfallUsd: gap.shortfall,
	};
}

export function sorExecutingButtonLabel(
	phase: SorExecutionPhase | undefined,
	dots: string,
	prefundLegProgress: SorPrefundLegProgress | null | undefined,
): string {
	const prefundHop =
		prefundLegProgress &&
		prefundLegProgress.total > 1 &&
		prefundLegProgress.current >= 1
			? ` (${prefundLegProgress.current}/${prefundLegProgress.total})`
			: "";
	if (phase === "approving_funds_transfer") {
		return `Approving funds transfer${prefundHop}${dots}`;
	}
	if (phase === "approving_trades") {
		return `Approving trades${dots}`;
	}
	if (phase === "moving_funds") {
		if (prefundHop) {
			return `Moving funds${prefundHop}${dots}`;
		}
		return `Moving funds${dots}`;
	}
	return `Executing trade${dots}`;
}

export function aggregateCashFromSor(
	usdcBalance: unknown,
	sorState: { totalAvailableCash?: number } | undefined,
): number {
	const baseUsdc =
		typeof usdcBalance === "number" ? usdcBalance : parseFloat(String(usdcBalance || "0"));
	if (
		sorState &&
		typeof sorState.totalAvailableCash === "number" &&
		Number.isFinite(sorState.totalAvailableCash)
	) {
		return sorState.totalAvailableCash;
	}
	if (sorState) {
		if (missingPooledCashWarnCount < MAX_MISSING_POOLED_CASH_WARNS) {
			missingPooledCashWarnCount += 1;
			console.warn(
				"[aggregateCashFromSor] totalAvailableCash missing or non-finite; pooled SOR cash treated as $0 (no Base-only fallback).",
			);
		}
		return 0;
	}
	return baseUsdc;
}

type CheckSufficientBalanceFn = (
	amount: string,
	orderType: "market" | "limit",
	side: "buy" | "sell",
	usdcBalance: number,
	price?: string,
	marketOrderEstimatedCost?: number | null,
	tradingVenue?: TradingVenue,
) => { hasSufficientBalance: boolean; requiredAmount: number };

/** Buy-only: zero pooled cash → Add Funds CTA (same semantics as unified block). */
export function buyAddFundsIfZeroPooledCash(opts: {
	side: "buy" | "sell";
	aggregateCash: number;
	handleAddFunds: () => void;
}): ButtonStateResult | null {
	if (opts.side !== "buy" || !Number.isFinite(opts.aggregateCash) || opts.aggregateCash > 0) {
		return null;
	}
	return { text: "Add Funds", disabled: false, onClick: opts.handleAddFunds };
}

/** Buy-only: positive pooled cash but not enough for this order (after Add-Funds gate). */
export function buyInsufficientBalanceIfPositivePooledCash(opts: {
	side: "buy" | "sell";
	aggregateCash: number;
	amount: string;
	orderType: "market" | "limit";
	price?: string;
	estimatedCost: number | null;
	tradingVenue: TradingVenue;
	checkSufficientBalance: CheckSufficientBalanceFn;
	handleAddFunds?: () => void;
}): ButtonStateResult | null {
	if (opts.side !== "buy") return null;
	if (!Number.isFinite(opts.aggregateCash)) return null;
	const marketOrderEstimatedCost =
		opts.orderType === "market" && opts.side === "buy" ? opts.estimatedCost : null;
	const balanceCheck = opts.checkSufficientBalance(
		opts.amount,
		opts.orderType,
		"buy",
		opts.aggregateCash,
		opts.price,
		marketOrderEstimatedCost,
		opts.tradingVenue,
	);
	if (balanceCheck.hasSufficientBalance) return null;
	const shortfall = Math.max(0, balanceCheck.requiredAmount - opts.aggregateCash);
	if (opts.handleAddFunds) {
		return {
			text: "Deposit to Trade",
			disabled: false,
			onClick: opts.handleAddFunds,
			depositShortfallUsd: shortfall,
		};
	}
	return { text: "Insufficient Balance", disabled: true, onClick: () => {} };
}

/**
 * Unified SOR primary for every single-venue trade — market/limit, buy/sell.
 * Prefund (LI.FI) is orchestrated inside sorState.handleExecute, so every
 * path runs through the same "bridge USDC, then sign the venue order" flow.
 */
type SorUnifiedPrimaryOptions = {
	venueAutoSetupInFlight?: boolean;
	/** Sell: requested share count in the amount field (validated vs `maxSellShares`). */
	sellAmountStr?: string;
	/** Combined held shares for the active outcome + venue scope (from SOR `venuePositions`). */
	maxSellShares?: number;
	/**
	 * True while any global background activator (Polymarket / Predict /
	 * Limitless) is still bootstrapping. Used to swap "Complete venue setup" /
	 * generic loading copy for a friendly "Setting up your account…" label so
	 * brand-new users never see venue jargon mid-onboarding.
	 */
	globalSetupInProgress?: boolean;
	/** Smart-routing tab: buy loading copy is "Finding best price…". */
	smartRoutingTab?: boolean;
};

function sorRouteLoadingLabel(
	side: "buy" | "sell",
	smartRoutingTab: boolean,
): string {
	if (smartRoutingTab) {
		return side === "buy" ? "Finding best price..." : "Fetching price...";
	}
	return userMessage(BTN_FETCHING_PRICE);
}

/** "Buy YES" / "Buy {team}" label shared by smart-routing and fallback paths. */
export function buildTradeActionButtonText(
	side: "buy" | "sell",
	selectedPosition: "yes" | "no",
	market: unknown,
): string {
	const actionText = side === "buy" ? "Buy" : "Sell";
	let buttonText = `${actionText} ${selectedPosition.toUpperCase()}`;
	if (market) {
		const title = (
			(market as { displayName?: string; question?: string })?.displayName ||
			(market as { question?: string })?.question ||
			""
		).trim();
		const parts = title
			.split(/\s*vs\.?\s*/i)
			.map((s: string) => s.trim())
			.filter(Boolean);
		const isVsSingle =
			parts.length === 2 &&
			(market as { umbrellaChildrenCount?: number })?.umbrellaChildrenCount === 1;
		if (isVsSingle) {
			const teamName = selectedPosition === "yes" ? parts[0] : parts[1];
			buttonText = `${actionText} ${teamName}`;
		}
	}
	return buttonText;
}

export function sorUnifiedPrimary(
	side: "buy" | "sell",
	sorState:
		| {
				route: RoutePlan | null;
				isLoading: boolean;
				isStale: boolean;
				error: string | null;
				routeErrorCode?: string | null;
				isExecuting: boolean;
				executionPhase?: SorExecutionPhase;
				prefundLegProgress?: SorPrefundLegProgress | null;
				routeExpired: boolean;
				handleExecute: () => void;
				totalAvailableCash?: number;
				handleAddFunds?: () => void;
		  }
		| undefined,
	buttonText: string,
	animatedDots: string,
	options?: SorUnifiedPrimaryOptions | boolean,
): ButtonStateResult | null {
	if (!sorState?.handleExecute) return null;

	let venueAutoSetupInFlight = false;
	let sellAmountStr: string | undefined;
	let maxSellShares: number | undefined;
	let globalSetupInProgress = false;
	let smartRoutingTab = false;
	if (typeof options === "boolean") {
		venueAutoSetupInFlight = options;
	} else if (options && typeof options === "object") {
		venueAutoSetupInFlight = options.venueAutoSetupInFlight ?? false;
		sellAmountStr = options.sellAmountStr;
		maxSellShares = options.maxSellShares;
		globalSetupInProgress = options.globalSetupInProgress ?? false;
		smartRoutingTab = options.smartRoutingTab ?? false;
	}

	const dep = trySorDepositToTrade(side, sorState);
	if (dep) return dep;
	if (sorState.isExecuting) {
		return {
			text: sorExecutingButtonLabel(
				sorState.executionPhase,
				animatedDots,
				sorState.prefundLegProgress,
			),
			disabled: true,
			onClick: () => {},
		};
	}
	if (sorState.isLoading && !sorState.route) {
		return {
			text: sorRouteLoadingLabel(side, smartRoutingTab),
			disabled: true,
			onClick: () => {},
		};
	}
	if (sorState.error && !sorState.route && !sorState.isLoading) {
		if (sorState.routeErrorCode === "AMOUNT_TOO_SMALL") {
			return {
				text: sorState.error || "Below trade minimum. Increase trade size",
				disabled: true,
				onClick: () => {},
			};
		}
		if (sorState.routeErrorCode === "WHOLE_SHARES_ONLY") {
			return {
				text: "Enter whole share amount",
				disabled: true,
				onClick: () => {},
			};
		}
		// Distinguish "books still loading" / "market just resolved" — those
		// are naturally transient — from "no venue can serve this size".
		// By the time these codes surface (after retries + grace) the books are
		// confirmed missing, so phrase the button as the user-facing reality.
		const code = sorState.routeErrorCode;
		if (code === "NO_BOOKS_AVAILABLE" || code === "NO_MARKET_FOUND") {
			return {
				text:
					side === "buy"
						? userMessage(BTN_NO_SHARES_AVAILABLE)
						: userMessage(BTN_NO_BIDS_AVAILABLE),
				disabled: true,
				onClick: () => {},
			};
		}
		if (code === "ALL_BOOKS_STALE") {
			return {
				text: userMessage(BTN_REFRESHING_VENUE_PRICES),
				disabled: true,
				onClick: () => {},
			};
		}
		const execNotReady = code === "EXECUTION_NOT_READY";
		if (execNotReady && globalSetupInProgress) {
			return {
				text: SETUP_IN_PROGRESS_LABEL,
				disabled: true,
				onClick: () => {},
			};
		}
		return {
			text: execNotReady
				? venueAutoSetupInFlight
					? VENUE_LOADING_LABEL
					: executionNotReadyButtonLabel({
							serverError: sorState.error,
						})
				: "Route unavailable",
			disabled: true,
			onClick: () => {},
		};
	}
	if (sorState.routeExpired) {
		return { text: "Refreshing Odds…", disabled: true, onClick: () => {} };
	}
	if (!sorState.route) {
		return {
			text: sorRouteLoadingLabel(side, smartRoutingTab),
			disabled: true,
			onClick: () => {},
		};
	}
	if (routeFailsVenueMinimums(sorState.route, side)) {
		const isLimit = sorState.route?.legs?.some((l) => l.orderType === "limit");
		const message = isLimit
			? SOR_FLOOR_MESSAGES.limitOrder
			: side === "buy"
				? SOR_FLOOR_MESSAGES.marketBuy
				: SOR_FLOOR_MESSAGES.marketSell;
		return { text: message, disabled: true, onClick: () => {} };
	}
	if (
		side === "sell" &&
		maxSellShares != null &&
		Number.isFinite(maxSellShares) &&
		sellAmountStr != null
	) {
		const req = parseFloat(sellAmountStr);
		if (Number.isFinite(req) && req > 0 && req > maxSellShares + 1e-9) {
			return { text: userMessage(BTN_NOT_ENOUGH_SHARES), disabled: true, onClick: () => {} };
		}
	}
	return {
		text: buttonText,
		disabled: false,
		onClick: sorState.handleExecute,
	};
}
