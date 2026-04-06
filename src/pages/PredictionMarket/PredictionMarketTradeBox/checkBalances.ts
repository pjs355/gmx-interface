import { useState, useEffect } from "react";
import { useUserData } from "context/UserDataContext";
import { useSignerContext } from "context/SignerContext";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";

// Simple in-memory cache to avoid duplicate RPC calls per session
// Key: `${account}:${tokenId}` -> value: string balance
const balanceCache = new Map<string, string>();

function getCacheKey(account: string, tokenId: string): string {
	return `${account}:${tokenId}`;
}

export function useUSDCBalance() {
	const { usdcBalance } = useUserData();
	return Number(usdcBalance ?? 0);
}

// Hook to fetch YES/NO token balances for a specific market
export function useYesNoBalances(market: {
	yesTokenId?: string;
	noTokenId?: string;
	_id?: string;
}) {
	const { account } = useSignerContext();
	const { getTokenBalance } = useUserData();
	const [yesBalance, setYesBalance] = useState<number>(0);
	const [noBalance, setNoBalance] = useState<number>(0);

	useEffect(() => {
		if (!account || !market?.yesTokenId || !market?.noTokenId) {
			setYesBalance(0);
			setNoBalance(0);
			return;
		}

		// Get the market ID for lookup in UserDataContext
		const marketId = market._id;
		if (!marketId) {
			setYesBalance(0);
			setNoBalance(0);
			return;
		}

		// Use getTokenBalance from UserDataContext which has the most up-to-date balances
		const tokenBalance = getTokenBalance(marketId);
		if (tokenBalance) {
			const yesBal = Number(tokenBalance.yesBalance) || 0;
			const noBal = Number(tokenBalance.noBalance) || 0;
			console.log(`🔍 useYesNoBalances - Market ${marketId}:`, {
				yesBalance: yesBal,
				noBalance: noBal,
			});
			setYesBalance(yesBal);
			setNoBalance(noBal);
		} else {
			// Fallback to local cache if UserDataContext doesn't have this market yet
			const yesKey = getCacheKey(account, market.yesTokenId);
			const noKey = getCacheKey(account, market.noTokenId);
			const cachedYes = balanceCache.get(yesKey);
			const cachedNo = balanceCache.get(noKey);
			const yesBal = cachedYes ? Number(cachedYes) : 0;
			const noBal = cachedNo ? Number(cachedNo) : 0;
			console.log(`No Balance for Tokens`);
			setYesBalance(yesBal);
			setNoBalance(noBal);
		}
	}, [
		account,
		market?.yesTokenId,
		market?.noTokenId,
		market?._id,
		getTokenBalance,
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
	tradingVenue: TradingVenue = "levelup"
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

		const baseCost = amountNum * priceNum / 100;
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

// Function to check if user has sufficient YES/NO token shares for sell orders
export function checkSufficientShares(
	amount: string,
	orderType: "market" | "limit",
	side: "buy" | "sell",
	position: "yes" | "no",
	yesBalance: number,
	noBalance: number,
	/** When set (e.g. Predict.fun on-chain outcome balance), ignores yes/no split. */
	outcomeBalanceOverride?: number | null
): { hasSufficientShares: boolean; requiredShares: number } {
	if (side !== "sell") {
		return { hasSufficientShares: true, requiredShares: 0 };
	}

	const amountNum = Number(amount);
	if (!isFinite(amountNum) || amountNum <= 0) {
		return { hasSufficientShares: true, requiredShares: 0 };
	}

	// For sell orders, amount represents the number of shares they want to sell
	const requiredShares = amountNum;
	const availableShares =
		outcomeBalanceOverride != null && Number.isFinite(outcomeBalanceOverride)
			? outcomeBalanceOverride
			: position === "yes"
				? yesBalance
				: noBalance;

	return {
		hasSufficientShares: availableShares >= requiredShares,
		requiredShares,
	};
}
