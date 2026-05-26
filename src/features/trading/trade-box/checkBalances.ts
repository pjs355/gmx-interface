import { useState, useEffect } from "react";
import { useAccountLevelUpPositions } from "@/context/AccountDataContext";
import { useSignerContext } from "context/SignerContext";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

// Simple in-memory cache to avoid duplicate RPC calls per session
// Key: `${account}:${tokenId}` -> value: string balance
const balanceCache = new Map<string, string>();

function getCacheKey(account: string, tokenId: string): string {
	return `${account}:${tokenId}`;
}

// Hook to fetch YES/NO token balances for a specific market
export function useYesNoBalances(market: {
	yesTokenId?: string;
	noTokenId?: string;
	_id?: string;
}) {
	const { account } = useSignerContext();
	const levelUpPositions = useAccountLevelUpPositions();
	const { getMarketBalance, readSideShares, rows: levelUpRows } = levelUpPositions;
	const [yesBalance, setYesBalance] = useState<number>(0);
	const [noBalance, setNoBalance] = useState<number>(0);

	useEffect(() => {
		if (!account || !market?.yesTokenId || !market?.noTokenId) {
			setYesBalance(0);
			setNoBalance(0);
			return;
		}

		const marketId = market._id;
		if (!marketId) {
			setYesBalance(0);
			setNoBalance(0);
			return;
		}

		const yes = readSideShares(marketId, "yes");
		const no = readSideShares(marketId, "no");
		if (yes > 0 || no > 0) {
			if (isTradingDebugLoggingEnabled()) {
				console.log(`🔍 useYesNoBalances - Market ${marketId}:`, {
					yesBalance: yes,
					noBalance: no,
				});
			}
			setYesBalance(yes);
			setNoBalance(no);
			return;
		}

		const tokenBalance = getMarketBalance(marketId);
		if (tokenBalance) {
			const yesBal = Number(tokenBalance.yesBalance) || 0;
			const noBal = Number(tokenBalance.noBalance) || 0;
			if (isTradingDebugLoggingEnabled()) {
				console.log(`🔍 useYesNoBalances - Market ${marketId}:`, {
					yesBalance: yesBal,
					noBalance: noBal,
				});
			}
			setYesBalance(yesBal);
			setNoBalance(noBal);
		} else {
			const yesKey = getCacheKey(account, market.yesTokenId);
			const noKey = getCacheKey(account, market.noTokenId);
			const cachedYes = balanceCache.get(yesKey);
			const cachedNo = balanceCache.get(noKey);
			const yesBal = cachedYes ? Number(cachedYes) : 0;
			const noBal = cachedNo ? Number(cachedNo) : 0;
			setYesBalance(yesBal);
			setNoBalance(noBal);
		}
	}, [
		account,
		market?.yesTokenId,
		market?.noTokenId,
		market?._id,
		getMarketBalance,
		readSideShares,
		levelUpRows,
	]);

	return { yesBalance, noBalance };
}

export function checkSufficientBalance(
	amount: string,
	orderType: "market" | "limit",
	side: "buy" | "sell",
	usdcBalance: number,
	price?: string,
	marketOrderEstimatedCost?: number | null,
	tradingVenue: TradingVenue = "levelup",
): { hasSufficientBalance: boolean; requiredAmount: number } {
	if (side !== "buy") {
		return { hasSufficientBalance: true, requiredAmount: 0 };
	}

	const amountNum = Number(amount);
	if (!isFinite(amountNum) || amountNum <= 0) {
		return { hasSufficientBalance: true, requiredAmount: 0 };
	}

	if (orderType === "market") {
		const requiredAmount = marketOrderEstimatedCost ?? amountNum;
		return {
			hasSufficientBalance: usdcBalance >= requiredAmount,
			requiredAmount: requiredAmount,
		};
	} else {
		const priceNum = Number(price);
		if (!isFinite(priceNum) || priceNum <= 0) {
			return { hasSufficientBalance: true, requiredAmount: 0 };
		}

		const baseCost = (amountNum * priceNum) / 100;
		const cfg = getVenueConfig(tradingVenue);
		const limitFee = cfg.estimateFee({
			contracts: amountNum,
			price: priceNum / 100,
			side: "buy",
		});
		const estimatedCost = baseCost + limitFee;
		return {
			hasSufficientBalance: usdcBalance >= estimatedCost,
			requiredAmount: estimatedCost,
		};
	}
}

/** Sell-amount tolerance vs held shares — see inline comment in prior version. */
export const SHARE_SELL_COMPARE_EPS = 0.01;

export function formatShareCountDisplay(n: number): string {
	if (!Number.isFinite(n)) return String(n);
	if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9) {
		return String(Math.round(n));
	}
	const floored = Math.floor(n * 100) / 100;
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 0,
	}).format(floored);
}

export function formatShareCountDataQa(n: number): string {
	if (!Number.isFinite(n) || n < 0) return String(n);
	const hundredths = Math.floor(n * 100 + 1e-9);
	const whole = Math.trunc(hundredths / 100);
	const frac = hundredths % 100;
	return `${whole}.${frac.toString().padStart(2, "0")}`;
}

export function sellBreakdownIsOnlyWholeContractVenues(rows: readonly { key: string }[]): boolean {
	if (rows.length === 0) return false;
	return rows.every((r) => r.key === "levelup" || r.key === "dflow");
}

export function clampSellSharesNumeric(
	n: number,
	maxScoped: number,
	requiresWholeShares: boolean,
): number {
	if (!Number.isFinite(n) || maxScoped <= 0) return n;
	let cap = maxScoped;
	if (requiresWholeShares) {
		cap = Math.floor(cap);
	}
	let v = Math.min(n, cap);
	if (requiresWholeShares) {
		v = Math.floor(v);
	}
	return v;
}

export function clampedSellSharesAmountString(
	clamped: number,
	requiresWholeShares: boolean,
): string {
	if (!Number.isFinite(clamped)) return "";
	if (requiresWholeShares) return String(Math.round(clamped));
	if (Number.isInteger(clamped) || Math.abs(clamped - Math.round(clamped)) < 1e-9) {
		return String(Math.round(clamped));
	}
	const hundredths = Math.floor(clamped * 100 + 1e-9);
	const whole = Math.trunc(hundredths / 100);
	const frac = hundredths % 100;
	if (frac === 0) return String(whole);
	return `${whole}.${frac.toString().padStart(2, "0")}`;
}

export function checkSufficientShares(
	amount: string,
	_orderType: "market" | "limit",
	side: "buy" | "sell",
	position: "yes" | "no",
	yesBalance: number,
	noBalance: number,
	outcomeBalanceOverride?: number | null,
): { hasSufficientShares: boolean; requiredShares: number } {
	if (side !== "sell") {
		return { hasSufficientShares: true, requiredShares: 0 };
	}

	const amountNum = Number(amount);
	if (!isFinite(amountNum) || amountNum <= 0) {
		return { hasSufficientShares: true, requiredShares: 0 };
	}

	const requiredShares = amountNum;
	const availableShares =
		outcomeBalanceOverride != null && Number.isFinite(outcomeBalanceOverride)
			? outcomeBalanceOverride
			: position === "yes"
				? yesBalance
				: noBalance;

	return {
		hasSufficientShares: availableShares + SHARE_SELL_COMPARE_EPS >= requiredShares,
		requiredShares,
	};
}
