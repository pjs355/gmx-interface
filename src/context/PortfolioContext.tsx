import React, { createContext, useContext, useMemo } from "react";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useSignerContext } from "context/SignerContext";
import { useOptionalPositionsPageData } from "@/context/PositionsDataContext";

type PortfolioContextValue = {
	/** Cash + Positions summary total; `null` while cash or positions summary is loading. */
	portfolioTotal: number | null;
	/** Sum of Positions summary rows (open MTM + unclaimed winnings). */
	positionsTotalValue: number;
	/** `null` until `CollateralTokenContext` has settled at least once. */
	cashBalance: number | null;
	loading: boolean;
	cashLoading: boolean;
	portfolioLoading: boolean;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

/** Used when a consumer mounts outside `PortfolioProvider` (broken tree or duplicate context module under Vite HMR). */
const PORTFOLIO_CONTEXT_FALLBACK: PortfolioContextValue = {
	portfolioTotal: null,
	positionsTotalValue: 0,
	cashBalance: null,
	loading: true,
	cashLoading: true,
	portfolioLoading: true,
};

let portfolioProviderMissingLogged = false;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
	const { account } = useSignerContext();
	const positionsData = useOptionalPositionsPageData();
	const positionsTotalValue = positionsData?.positionsTotalValue ?? 0;
	const positionsSummaryLoading = positionsData?.positionsSummaryLoading ?? false;
	const collateral = useCollateralTokens();

	const cashBalance: number | null = useMemo(() => {
		if (!collateral.isFetched) return null;
		return collateral.total;
	}, [collateral.isFetched, collateral.total]);

	const cashLoading = Boolean(account) && !collateral.isFetched;
	const portfolioLoading = Boolean(account) && (cashLoading || positionsSummaryLoading);

	const portfolioTotal: number | null = useMemo(() => {
		if (!account) return 0;
		if (cashBalance === null || positionsSummaryLoading) return null;
		return cashBalance + positionsTotalValue;
	}, [account, cashBalance, positionsSummaryLoading, positionsTotalValue]);

	const value = useMemo<PortfolioContextValue>(
		() => ({
			portfolioTotal,
			positionsTotalValue,
			cashBalance,
			loading: portfolioLoading,
			cashLoading,
			portfolioLoading,
		}),
		[portfolioTotal, positionsTotalValue, cashBalance, portfolioLoading, cashLoading],
	);

	return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
	const ctx = useContext(PortfolioContext);
	if (ctx) {
		return ctx;
	}
	if (import.meta.env.DEV) {
		if (!portfolioProviderMissingLogged) {
			portfolioProviderMissingLogged = true;
			console.error(
				"[usePortfolio] No PortfolioProvider context (duplicate React/context bundle or provider order bug). Using loading fallback — hard-refresh the dev server if this persists.",
			);
		}
		return PORTFOLIO_CONTEXT_FALLBACK;
	}
	throw new Error("usePortfolio must be used within a <PortfolioProvider>");
}
