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
import { usePrivy } from "@privy-io/react-auth";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import { useBridgeFundingBalances } from "@/trading/hooks/useBridgeFundingBalances";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { sumPredictPositionMarkValue } from "@/trading/predict/sumPredictPositionMarkValue";
import { usePredictMarketDetailsMap } from "@/trading/predict/usePredictMarketDetailsMap";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useOddsMonitor } from "context/OddsMonitorContext";

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
	const { account, signerAddress } = useSignerContext();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
		allBooksPreview,
		booksPreviewLoading,
	} = usePredictionData();
	const { appState } = useOddsMonitor();
	const {
		usdcBalance,
		tokenBalances,
		loading: userDataLoading,
	} = useUserData();

	// Defer venue queries until after the initial paint so the homepage renders fast.
	// USDC cash shows immediately; venue cash/positions fill in after first frame.
	const [venueReady, setVenueReady] = React.useState(false);
	React.useEffect(() => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const rafId = requestAnimationFrame(() => {
			timeoutId = setTimeout(() => setVenueReady(true), 0);
		});
		return () => {
			cancelAnimationFrame(rafId);
			if (timeoutId !== null) clearTimeout(timeoutId);
		};
	}, []);

	const { polymarketSafe, embeddedEoa, solanaAddress } = useFundingAddresses();
	const { authenticated } = usePrivy();
	const dflowProof = useDflowProofStatus();
	const solanaLinked = Boolean(solanaAddress?.trim());

	const venueEnabled = venueReady && Boolean(polymarketSafe || embeddedEoa || solanaAddress);

	const bridgeBalances = useBridgeFundingBalances({
		baseSmartWallet: undefined,
		polymarketSafe: venueEnabled ? polymarketSafe : null,
		embeddedEoa: venueEnabled ? embeddedEoa : null,
		solanaAddress: venueEnabled ? solanaAddress : null,
		enabled: venueEnabled,
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

	const polyPositionsQuery = usePolymarketPositions(venueReady ? polymarketSafe : null);
	const polyPositionsTotal = useMemo(() => {
		if (!polyPositionsQuery.data) return 0;
		return polyPositionsQuery.data.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0
		);
	}, [polyPositionsQuery.data]);

	// Match usePositionsData: Predict.fun keys off the embedded signer (BNB), not the Base smart wallet.
	const predictQueryAddress = signerAddress ?? account;
	const predictPositionsQuery = usePredictPositions(
		venueReady ? (predictQueryAddress ?? null) : null
	);
	const predictPortfolioMarketIds = useMemo(() => {
		const ids = new Set<number>();
		for (const p of predictPositionsQuery.data ?? []) {
			if (p.numericMarketId) ids.add(p.numericMarketId);
		}
		return Array.from(ids);
	}, [predictPositionsQuery.data]);
	const predictMarketDetailsPortfolioQuery = usePredictMarketDetailsMap(
		predictPortfolioMarketIds,
		venueReady && predictPortfolioMarketIds.length > 0,
	);
	const predictPositionsTotal = useMemo(() => {
		if (!predictPositionsQuery.data) return 0;
		return sumPredictPositionMarkValue(
			predictPositionsQuery.data,
			allBooksPreview,
			umbrellas,
			getQuestionsForUmbrella,
			appState?.markets,
			predictMarketDetailsPortfolioQuery.data ?? null,
		);
	}, [
		predictPositionsQuery.data,
		allBooksPreview,
		umbrellas,
		getQuestionsForUmbrella,
		appState?.markets,
		predictMarketDetailsPortfolioQuery.data,
	]);

	const privateApi = usePrivateApiClient();
	const dflowRpcEnabled =
		venueReady &&
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;
	const dflowPositionsQuery = useDflowPositions(
		venueReady ? solanaAddress : null,
		privateApi,
		{ enabled: dflowRpcEnabled },
	);
	const dflowPositionsTotal = useMemo(() => {
		if (!dflowPositionsQuery.data) return 0;
		return dflowPositionsQuery.data.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0
		);
	}, [dflowPositionsQuery.data]);

	// Resolved LevelUp markets live in resolvedMarketsByUmbrella (not getQuestionsForUmbrella).
	// Each winning share is worth $1 at settlement — same economics as the Winnings table.
	const levelUpResolvedWinningsTotal = useMemo(() => {
		let sum = 0;
		for (const resolvedMarkets of Object.values(resolvedMarketsByUmbrella)) {
			if (!Array.isArray(resolvedMarkets)) continue;
			for (const m of resolvedMarkets) {
				const balanceId = (m as { _id?: string })?._id;
				if (!balanceId) continue;
				const tb = tokenBalances.get(balanceId);
				if (!tb) continue;
				const outcome = String(
					(m as { resolvedOutcome?: string }).resolvedOutcome || "",
				).toLowerCase();
				const y = Number(tb.yesBalance) || 0;
				const n = Number(tb.noBalance) || 0;
				if (outcome === "yes" && y > 0) sum += y;
				else if (outcome === "no" && n > 0) sum += n;
			}
		}
		return sum;
	}, [resolvedMarketsByUmbrella, tokenBalances]);

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
	const dflowBlockingPortfolio =
		Boolean(account) &&
		solanaLinked &&
		Boolean(authenticated) &&
		(!dflowProof.isFetched ||
			(dflowProof.isVerified && dflowPositionsQuery.isLoading));

	// Portfolio is loading if we haven't loaded it yet OR if balances/prices are still being fetched
	const portfolioLoading =
		!hasInitialPortfolioLoad ||
		(userDataLoading && tokenBalances.size === 0) ||
		booksPreviewLoading ||
		dflowBlockingPortfolio;

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

				// Align with BookPreview from PredictionDataContext + Positions usePositionsData
				const preview = allBooksPreview[priceId];
				const yp = preview?.lowestAsk ?? preview?.bestYesPrice ?? null;
				const np =
					typeof preview?.bestNoPrice === "number"
						? preview.bestNoPrice
						: preview?.highestBid != null && preview?.highestBid !== undefined
							? 1 - preview.highestBid
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
			// Always include claimable LevelUp settlement value (not in active market list / preview).
			nextPositions += levelUpResolvedWinningsTotal;
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
		levelUpResolvedWinningsTotal,
		polySafeUsdcE,
		bscUsdtCash,
		solanaUsdcCash,
	]);

	useEffect(() => {
		if (!account) {
			setPortfolioTotal(0);
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
		levelUpResolvedWinningsTotal,
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
