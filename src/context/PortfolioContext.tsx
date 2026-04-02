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
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useBridgeFundingBalances } from "@/trading/hooks/useBridgeFundingBalances";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";

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

	// Polymarket Safe USDC.e + Predict BSC USDT + Solana USDC (venue cash balances)
	const { polymarketSafe, embeddedEoa, solanaAddress } = useFundingAddresses();
	const bridgeBalances = useBridgeFundingBalances({
		baseSmartWallet: undefined,
		polymarketSafe,
		embeddedEoa,
		solanaAddress,
		enabled: Boolean(polymarketSafe || embeddedEoa || solanaAddress),
	});
	const polySafeUsdcE = bridgeBalances.data?.polygonUsdcEHuman
		? Number(bridgeBalances.data.polygonUsdcEHuman)
		: 0;
	const bscUsdtCash = bridgeBalances.data?.bscUsdtHuman
		? Number(bridgeBalances.data.bscUsdtHuman)
		: 0;
	const solanaUsdcCash = bridgeBalances.data?.solanaUsdcHuman
		? Number(bridgeBalances.data.solanaUsdcHuman)
		: 0;

	const polyPositionsQuery = usePolymarketPositions(polymarketSafe);
	const polyPositionsTotal = useMemo(() => {
		if (!polyPositionsQuery.data) return 0;
		return polyPositionsQuery.data.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0
		);
	}, [polyPositionsQuery.data]);

	const predictPositionsQuery = usePredictPositions(account ?? null);
	const predictPositionsTotal = useMemo(() => {
		if (!predictPositionsQuery.data) return 0;
		return predictPositionsQuery.data.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0
		);
	}, [predictPositionsQuery.data]);

	const privateApi = usePrivateApiClient();
	const dflowPositionsQuery = useDflowPositions(solanaAddress, privateApi);
	const dflowPositionsTotal = useMemo(() => {
		if (!dflowPositionsQuery.data) return 0;
		return dflowPositionsQuery.data.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0
		);
	}, [dflowPositionsQuery.data]);

	// Track separate loading states
	const [hasInitialCashLoad, setHasInitialCashLoad] = React.useState(false);
	const [hasInitialPortfolioLoad, setHasInitialPortfolioLoad] =
		React.useState(false);
	const initialLoadTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	// Reset loading states when account changes
	React.useEffect(() => {
		setHasInitialCashLoad(false);
		setHasInitialPortfolioLoad(false);
		// Clear any existing timeout
		if (initialLoadTimeoutRef.current) {
			clearTimeout(initialLoadTimeoutRef.current);
			initialLoadTimeoutRef.current = null;
		}
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

	// Set a timeout to force initial portfolio load complete after reasonable wait
	// This handles new users with no trading history where data loads quickly but portfolioTotal might be 0
	React.useEffect(() => {
		if (account && !hasInitialPortfolioLoad && !userDataLoading) {
			// If user data has finished loading and we still haven't set portfolio, give it 2 seconds max
			initialLoadTimeoutRef.current = setTimeout(() => {
				if (!hasInitialPortfolioLoad) {
					console.log('Portfolio: Forcing initial load complete after timeout');
					setHasInitialPortfolioLoad(true);
				}
			}, 2000);
		}
		return () => {
			if (initialLoadTimeoutRef.current) {
				clearTimeout(initialLoadTimeoutRef.current);
			}
		};
	}, [account, hasInitialPortfolioLoad, userDataLoading]);

	// Cash is loading if we haven't loaded it yet and user data is loading
	const cashLoading =
		!hasInitialCashLoad &&
		(usdcBalance === null || usdcBalance === undefined);
	// Portfolio is loading if we haven't loaded it yet OR if balances/prices are still being fetched
	const portfolioLoading =
		!hasInitialPortfolioLoad ||
		(userDataLoading && tokenBalances.size === 0) ||
		booksPreviewLoading;

	// Stable cash balance: LevelUp Base USDC + Polymarket Safe USDC.e + Predict BSC USDT
	const cashBalance = useMemo(() => {
		const baseCash =
			usdcBalance === null || usdcBalance === undefined
				? lastCashRef.current
				: Number(usdcBalance) || 0;
		if (usdcBalance !== null && usdcBalance !== undefined) {
			lastCashRef.current = baseCash;
		}
		return baseCash + polySafeUsdcE + bscUsdtCash + solanaUsdcCash;
	}, [usdcBalance, polySafeUsdcE, bscUsdtCash, solanaUsdcCash]);

	const compute = useCallback(() => {
		if (!account) {
			setPortfolioTotal(0);
			return;
		}

		// For users with no token balances (new users), we can compute immediately
		const hasNoTokens = tokenBalances.size === 0 && !userDataLoading;
		
		// Don't compute if prices haven't loaded yet, UNLESS user has no tokens
		if (booksPreviewLoading && !hasNoTokens) {
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

			// Include Polymarket + Predict.fun + DFlow positions value (off-chain venue APIs)
			positions += polyPositionsTotal + predictPositionsTotal + dflowPositionsTotal;

			// Smoothing: avoid snap-to-zero during transient loads
			const prevCash = lastCashRef.current;
			const prevPositions = lastPositionsRef.current;
			const nextCash = cashBalance;
			let nextPositions = positions;
			if (
				(pricedMarkets === 0 || markets.length === 0) &&
				prevPositions > 0 &&
				polyPositionsTotal === 0 &&
				predictPositionsTotal === 0 &&
				dflowPositionsTotal === 0
			) {
				nextPositions = prevPositions;
			}
			const effectiveCash =
				usdcBalance === null || usdcBalance === undefined
					? prevCash + polySafeUsdcE + bscUsdtCash + solanaUsdcCash
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
		userDataLoading,
		polyPositionsTotal,
		predictPositionsTotal,
		dflowPositionsTotal,
		polySafeUsdcE,
		bscUsdtCash,
		solanaUsdcCash,
	]);

	useEffect(() => {
		if (!account) {
			setPortfolioTotal(0);
			return;
		}
		
		const hasNoTokens = tokenBalances.size === 0 && !userDataLoading;
		
		if (booksPreviewLoading && !hasNoTokens) {
			return;
		}
		compute();
		const t = setTimeout(compute, 500);
		return () => clearTimeout(t);
	}, [
		account,
		tokenBalances,
		usdcBalance,
		umbrellas,
		allBooksPreview,
		booksPreviewLoading,
		userDataLoading,
		compute,
		polyPositionsTotal,
		predictPositionsTotal,
		dflowPositionsTotal,
		polySafeUsdcE,
		bscUsdtCash,
		solanaUsdcCash,
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
