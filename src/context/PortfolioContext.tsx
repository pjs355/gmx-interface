import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { usePredictionData } from "context/PredictionDataContext";
import { useUserData } from "context/UserDataContext";
import { useSignerContext } from "context/SignerContext";

type PortfolioContextValue = {
	portfolioTotal: number | null;
	cashBalance: number;
	loading: boolean;
	cashLoading: boolean;
	portfolioLoading: boolean;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
	const [portfolioTotal, setPortfolioTotal] = useState<number | null>(null);
	const lastCashRef = React.useRef<number>(0);
	const lastPositionsRef = React.useRef<number>(0);
	const { account } = useSignerContext();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		allBooksPreview,
		booksPreviewLoading,
	} = usePredictionData();
	const {
		usdcBalance,
		tokenBalances,
		loading: userDataLoading,
	} = useUserData();

	// Track separate loading states
	const [hasInitialCashLoad, setHasInitialCashLoad] = React.useState(false);
	const [hasInitialPortfolioLoad, setHasInitialPortfolioLoad] =
		React.useState(false);

	// Reset loading states when account changes
	React.useEffect(() => {
		setHasInitialCashLoad(false);
		setHasInitialPortfolioLoad(false);
	}, [account]);

	React.useEffect(() => {
		if (usdcBalance !== null && usdcBalance !== undefined) {
			setHasInitialCashLoad(true);
		}
	}, [usdcBalance]);

	React.useEffect(() => {
		if (portfolioTotal !== null && portfolioTotal !== undefined) {
			setHasInitialPortfolioLoad(true);
		}
	}, [portfolioTotal]);

	// Cash is loading if we haven't loaded it yet and user data is loading
	const cashLoading =
		!hasInitialCashLoad &&
		(usdcBalance === null || usdcBalance === undefined);
	// Portfolio is loading if we haven't loaded it yet OR if balances/prices are still being fetched
	const portfolioLoading =
		!hasInitialPortfolioLoad ||
		(userDataLoading && tokenBalances.size === 0) ||
		booksPreviewLoading;

	// Stable cash balance: do not drop to 0 when upstream temporarily returns null
	const cashBalance = useMemo(() => {
		if (usdcBalance === null || usdcBalance === undefined) {
			return lastCashRef.current;
		}
		const val = Number(usdcBalance) || 0;
		lastCashRef.current = val;
		return val;
	}, [usdcBalance]);

	const compute = useCallback(() => {
		if (!account) {
			setPortfolioTotal(0);
			return;
		}

		// Don't compute if prices haven't loaded yet
		if (booksPreviewLoading) {
			return;
		}

		try {
			// Collect markets with BOTH IDs
			const markets: Array<{ balanceId: string; priceId: string }> = [];
			umbrellas.forEach((u: any) => {
				const marketList = getQuestionsForUmbrella(u._id) as any[];
				marketList.forEach((m: any) => {
					const balanceId = m?._id; // MongoDB ID for balances
					const priceId = m?.questionId || m?._id; // Transaction hash for prices
					if (balanceId && priceId) {
						markets.push({ balanceId, priceId });
					}
				});
			});
			
			// Compute positions total from tokenBalances and allBooksPreview (best ask/bid prices)
			let positions = 0;
			let pricedMarkets = 0;
			markets.forEach(({ balanceId, priceId }) => {
				// Get balances using MongoDB _id
				const tb = tokenBalances.get(balanceId);
				if (!tb) return;
				const yes = Number(tb.yesBalance) || 0;
				const no = Number(tb.noBalance) || 0;

				// Get prices using questionId (transaction hash) - EXACTLY like home page
				const preview = allBooksPreview[priceId];
				const yp = preview?.lowestAsk ?? null; // Yes price = lowestAsk
				const np =
					preview?.highestBid !== null &&
					preview?.highestBid !== undefined
						? 1 - preview.highestBid // No price = 1 - highestBid
						: null;

				if (typeof yp === "number" || typeof np === "number") {
					pricedMarkets += 1;
				}
				const yv = typeof yp === "number" ? yes * yp : 0;
				const nv = typeof np === "number" ? no * np : 0;
				positions += yv + nv;
			});

			// Smoothing: avoid snap-to-zero during transient loads
			const prevCash = lastCashRef.current;
			const prevPositions = lastPositionsRef.current;
			const nextCash = cashBalance;
			let nextPositions = positions;
			if (
				(pricedMarkets === 0 || markets.length === 0) &&
				prevPositions > 0
			) {
				nextPositions = prevPositions;
			}
			const effectiveCash =
				usdcBalance === null || usdcBalance === undefined
					? prevCash
					: nextCash;
			const nextTotal = effectiveCash + nextPositions;
			setPortfolioTotal((current) => {
				if (
					current !== null &&
					nextTotal === 0 &&
					(prevCash > 0 || prevPositions > 0)
				) {
					return current;
				}
				return nextTotal;
			});
			lastCashRef.current = effectiveCash;
			lastPositionsRef.current = nextPositions;
		} catch {
			setPortfolioTotal((current) => current ?? cashBalance);
		}
	}, [
		account,
		umbrellas,
		getQuestionsForUmbrella,
		tokenBalances,
		cashBalance,
		allBooksPreview,
		booksPreviewLoading,
	]);

	useEffect(() => {
		if (!account) {
			setPortfolioTotal(0);
			return;
		}
		// Don't compute until prices are loaded
		if (booksPreviewLoading) {
			return;
		}
		// Compute once on mount and whenever holdings or cash change.
		compute();
		// Recompute once more shortly after to include freshly loaded prices
		const t = setTimeout(compute, 500);
		return () => clearTimeout(t);
	}, [
		account,
		tokenBalances,
		usdcBalance,
		umbrellas,
		allBooksPreview,
		booksPreviewLoading,
		compute,
	]);

	const value = useMemo<PortfolioContextValue>(
		() => ({
			portfolioTotal,
			cashBalance,
			loading: userDataLoading,
			cashLoading,
			portfolioLoading,
		}),
		[
			portfolioTotal,
			cashBalance,
			userDataLoading,
			cashLoading,
			portfolioLoading,
		]
	);

	return (
		<PortfolioContext.Provider value={value}>
			{children}
		</PortfolioContext.Provider>
	);
}

export function usePortfolio(): PortfolioContextValue {
	const ctx = useContext(PortfolioContext);
	if (!ctx) {
		throw new Error("usePortfolio must be used within a PortfolioProvider");
	}
	return ctx;
}

export default PortfolioContext;
