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
import { useLimitlessVenuePositions } from "@/trading/limitless/useLimitlessPortfolioVenue";
import { limitlessPositionsForPortfolioMtm } from "@/trading/limitless/splitLimitlessVenuePositions";
import { debugLimitlessPortfolioTable } from "@/trading/limitless/limitlessPortfolioDebug";
import { isVenueMarketResolvedLike } from "@/types/trading/venuePosition";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useOddsMonitor } from "context/OddsMonitorContext";
import {
	syntheticVenueWinningsRowId,
	useRecentSettlementClaim,
} from "context/RecentSettlementClaimContext";

type PortfolioContextValue = {
	portfolioTotal: number | null;
	cashBalance: number;
	loading: boolean;
	cashLoading: boolean;
	portfolioLoading: boolean;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

/** Used when a consumer mounts outside `PortfolioProvider` (broken tree or duplicate context module under Vite HMR). */
const PORTFOLIO_CONTEXT_FALLBACK: PortfolioContextValue = {
	portfolioTotal: null,
	cashBalance: 0,
	loading: true,
	cashLoading: true,
	portfolioLoading: true,
};

let portfolioProviderMissingLogged = false;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
	const { acknowledgedClearedPayoutKeys } = useRecentSettlementClaim();
	const [portfolioTotal, setPortfolioTotal] = useState<number | null>(null);
	const lastCashRef = React.useRef<number>(0);
	/** Mark-to-market (LevelUp books) + off-chain venue — excludes unclaimed resolution value. */
	const lastMarkToMarketAndVenueRef = React.useRef<number>(0);
	/** Last full "positions" column (mtm+venue+LevelUp unclaimed) — for snap-to-zero guard only. */
	const lastPortfolioPositionColumnRef = React.useRef<number>(0);
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

	// Defer expensive venue queries until after the first frame (faster first paint).
	// Header cash still waits on `fundingHydrated` + first bridge fetch so the number does not step up.
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

	const {
		polymarketSafe,
		embeddedEoa,
		solanaAddress,
		limitlessMakerBase,
		fundingHydrated,
	} = useFundingAddresses();
	const { authenticated } = usePrivy();
	const dflowProof = useDflowProofStatus();
	const solanaLinked = Boolean(solanaAddress?.trim());

	const venueEnabled =
		venueReady &&
		Boolean(polymarketSafe || embeddedEoa || solanaAddress || limitlessMakerBase);

	const bridgeBalances = useBridgeFundingBalances({
		baseSmartWallet: undefined,
		limitlessMakerBase: venueEnabled ? limitlessMakerBase : null,
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
	const limitlessMakerUsdcCash = bridgeBalances.data?.baseLimitlessUsdcHuman
		? Number(bridgeBalances.data.baseLimitlessUsdcHuman)
		: 0;

	const polyPositionsQuery = usePolymarketPositions(venueReady ? polymarketSafe : null);
	const polyPositionsDataNetClaim = useMemo(() => {
		if (!polyPositionsQuery.data) return null;
		return polyPositionsQuery.data.filter(
			(p) =>
				!acknowledgedClearedPayoutKeys.has(
					syntheticVenueWinningsRowId("polymarket", p.tokenId),
				),
		);
	}, [acknowledgedClearedPayoutKeys, polyPositionsQuery.data]);
	const polyPositionsTotal = useMemo(() => {
		if (!polyPositionsDataNetClaim) return 0;
		return polyPositionsDataNetClaim.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0
		);
	}, [polyPositionsDataNetClaim]);

	// Match usePositionsData: Predict.fun keys off the embedded signer (BNB), not the Base smart wallet.
	const predictQueryAddress = signerAddress ?? account;
	const predictPositionsQuery = usePredictPositions(
		venueReady ? (predictQueryAddress ?? null) : null
	);
	const predictPositionsDataNetClaim = useMemo(() => {
		if (!predictPositionsQuery.data) return null;
		return predictPositionsQuery.data.filter(
			(p) =>
				!acknowledgedClearedPayoutKeys.has(
					syntheticVenueWinningsRowId("predictfun", p.tokenId),
				),
		);
	}, [acknowledgedClearedPayoutKeys, predictPositionsQuery.data]);
	const predictPortfolioMarketIds = useMemo(() => {
		const ids = new Set<number>();
		for (const p of predictPositionsDataNetClaim ?? []) {
			if (p.numericMarketId) ids.add(p.numericMarketId);
		}
		return Array.from(ids);
	}, [predictPositionsDataNetClaim]);
	const predictMarketDetailsPortfolioQuery = usePredictMarketDetailsMap(
		predictPortfolioMarketIds,
		venueReady && predictPortfolioMarketIds.length > 0,
	);
	const predictPositionsTotal = useMemo(() => {
		if (!predictPositionsDataNetClaim) return 0;
		return sumPredictPositionMarkValue(
			predictPositionsDataNetClaim,
			allBooksPreview,
			umbrellas,
			getQuestionsForUmbrella,
			appState?.markets,
			predictMarketDetailsPortfolioQuery.data ?? null,
		);
	}, [
		predictPositionsDataNetClaim,
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

	const limitlessPortfolioEnabled =
		venueReady &&
		Boolean(authenticated) &&
		Boolean(limitlessMakerBase?.trim());
	const limitlessVenuePositionsQuery =
		useLimitlessVenuePositions(limitlessPortfolioEnabled);
	const limitlessPositionsDataNetClaim = useMemo(() => {
		const src = limitlessVenuePositionsQuery.data;
		if (!src) return null;
		// Exclude History-bucket rows so header MTM matches Positions tab (no double-count on settled CLOB).
		const mtm = limitlessPositionsForPortfolioMtm(src);
		return mtm.filter(
			(p) =>
				!acknowledgedClearedPayoutKeys.has(
					syntheticVenueWinningsRowId("limitless", p.tokenId),
				),
		);
	}, [acknowledgedClearedPayoutKeys, limitlessVenuePositionsQuery.data]);
	const limitlessPositionsTotal = useMemo(() => {
		if (!limitlessPositionsDataNetClaim) return 0;
		return limitlessPositionsDataNetClaim.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0,
		);
	}, [limitlessPositionsDataNetClaim]);

	React.useEffect(() => {
		if (!import.meta.env.DEV) return;
		const rows = limitlessPositionsDataNetClaim;
		if (!rows || rows.length === 0) return;
		debugLimitlessPortfolioTable(
			"Portfolio header: limitless venue positions (MTM inputs)",
			rows.map((p) => ({
				title: (p.marketTitle ?? "").slice(0, 56),
				outcome: p.outcome,
				shares: p.shares,
				currentValue: p.currentValue,
				marketStatus: p.marketStatus ?? "(missing)",
				resolvedLike: isVenueMarketResolvedLike(p.marketStatus),
				redeemable: p.redeemable,
				tokenTail: (p.tokenId ?? "").slice(-14),
			})),
		);
	}, [limitlessPositionsDataNetClaim]);

	// Resolved LevelUp markets live in resolvedMarketsByUmbrella (not getQuestionsForUmbrella).
	// Each winning share is worth $1 at settlement — same economics as the Winnings table.
	const levelUpResolvedWinningsTotal = useMemo(() => {
		let sum = 0;
		for (const resolvedMarkets of Object.values(resolvedMarketsByUmbrella)) {
			if (!Array.isArray(resolvedMarkets)) continue;
			for (const m of resolvedMarkets) {
				const balanceId = (m as { _id?: string })?._id;
				if (!balanceId) continue;
				if (acknowledgedClearedPayoutKeys.has(String(balanceId))) continue;
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
	}, [acknowledgedClearedPayoutKeys, resolvedMarketsByUmbrella, tokenBalances]);

	// Track separate loading states
	const [hasInitialCashLoad, setHasInitialCashLoad] = React.useState(false);
	const [hasInitialPortfolioLoad, setHasInitialPortfolioLoad] =
		React.useState(false);
	const initialLoadTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	// Reset loading states when account changes
	React.useEffect(() => {
		setHasInitialCashLoad(false);
		setHasInitialPortfolioLoad(false);
		lastMarkToMarketAndVenueRef.current = 0;
		lastPortfolioPositionColumnRef.current = 0;
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

	// Cash = Base USDC + off-chain bridge balances. Avoid flicker: do not show a "partial"
	// total (Base only) and then a skeleton when venue/bundle loads — same rule the header uses.
	const baseCashMissing =
		!hasInitialCashLoad &&
		(usdcBalance === null || usdcBalance === undefined);
	// While `venueReady` is false, off-chain stables are not in the total yet; treat as loading.
	const waitingOnVenueDeferral = Boolean(account) && !venueReady;
	// Until profile + venue account data have loaded once, `venueEnabled` can flip and the
	// shown total would step from Base-only to Base+off-chain — keep the cash skeleton up.
	const waitingOnFundingHydration = Boolean(account) && !fundingHydrated;
	const waitingOnFirstBridge =
		Boolean(account) &&
		venueReady &&
		venueEnabled &&
		!bridgeBalances.isFetched;
	const cashLoading =
		baseCashMissing ||
		waitingOnVenueDeferral ||
		waitingOnFundingHydration ||
		waitingOnFirstBridge;
	// Only gate the header on DFlow when we actually fetch Solana positions (`dflowRpcEnabled`).
	// Previously we blocked on `solanaLinked && !dflowProof.isFetched`, which kept the portfolio
	// skeleton up for any Privy-linked Solana wallet until `/dflow/account` finished — and
	// `isVerified && isLoading` could stick true if the positions query never settled.
	const dflowBlockingPortfolio =
		Boolean(account) &&
		Boolean(authenticated) &&
		dflowRpcEnabled &&
		dflowPositionsQuery.isPending;

	// Portfolio is loading if we haven't loaded it yet OR if balances/prices are still being fetched
	const portfolioLoading =
		!hasInitialPortfolioLoad ||
		(userDataLoading && tokenBalances.size === 0) ||
		booksPreviewLoading ||
		dflowBlockingPortfolio;

	// Stable cash balance: LevelUp Base USDC + Limitless maker (Base) + Polymarket Safe USDC.e + Predict BSC USDT
	const cashBalance = useMemo(() => {
		const baseCash =
			usdcBalance === null || usdcBalance === undefined
				? lastCashRef.current
				: Number(usdcBalance) || 0;
		if (usdcBalance !== null && usdcBalance !== undefined) {
			lastCashRef.current = baseCash;
		}
		return (
			baseCash +
			limitlessMakerUsdcCash +
			polySafeUsdcE +
			bscUsdtCash +
			solanaUsdcCash
		);
	}, [
		usdcBalance,
		limitlessMakerUsdcCash,
		polySafeUsdcE,
		bscUsdtCash,
		solanaUsdcCash,
	]);

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
			
			// Mark-to-market from tokenBalances and allBooksPreview (best ask/bid)
			let markToMarket = 0;
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
				markToMarket += yv + nv;
			});

			// Off-chain venue notionals
			markToMarket +=
				polyPositionsTotal +
				predictPositionsTotal +
				dflowPositionsTotal +
				limitlessPositionsTotal;

			const prevCash = lastCashRef.current;
			const nextCash = cashBalance;
			const prevMtmv = lastMarkToMarketAndVenueRef.current;
			// Reuse only prior mtm+venue. Never reuse a value that already includes
			// levelUpResolvedWinningsTotal — it was re-added every 500ms tick and inflated the header.
			const prevForZeroGuard = lastPortfolioPositionColumnRef.current;
			let nextMtmv = markToMarket;
			if (
				booksPreviewLoading &&
				(pricedMarkets === 0 || markets.length === 0) &&
				prevMtmv > 0 &&
				polyPositionsTotal === 0 &&
				predictPositionsTotal === 0 &&
				dflowPositionsTotal === 0 &&
				limitlessPositionsTotal === 0
			) {
				nextMtmv = prevMtmv;
			}
			lastMarkToMarketAndVenueRef.current = nextMtmv;
			// Unclaimed LevelUp resolution ($1 / winning share) — one addition per recompute
			const positionColumnWithResolved =
				nextMtmv + levelUpResolvedWinningsTotal;
			lastPortfolioPositionColumnRef.current = positionColumnWithResolved;
			const effectiveCash =
				usdcBalance === null || usdcBalance === undefined
					? prevCash +
						limitlessMakerUsdcCash +
						polySafeUsdcE +
						bscUsdtCash +
						solanaUsdcCash
					: nextCash;
			const nextTotal = effectiveCash + positionColumnWithResolved;
			setPortfolioTotal((current) => {
				if (
					current !== null &&
					nextTotal === 0 &&
					(prevCash > 0 || prevForZeroGuard > 0)
				) {
					return current;
				}
				return nextTotal;
			});
			lastCashRef.current = effectiveCash;
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
		limitlessPositionsTotal,
		levelUpResolvedWinningsTotal,
		polySafeUsdcE,
		bscUsdtCash,
		solanaUsdcCash,
		limitlessMakerUsdcCash,
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
		limitlessPositionsTotal,
		levelUpResolvedWinningsTotal,
		polySafeUsdcE,
		bscUsdtCash,
		solanaUsdcCash,
		limitlessMakerUsdcCash,
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
	if (ctx) {
		return ctx;
	}
	if (import.meta.env.DEV && !portfolioProviderMissingLogged) {
		portfolioProviderMissingLogged = true;
		// eslint-disable-next-line no-console -- intentional once-per-session diagnostic
		console.error(
			"[usePortfolio] No PortfolioProvider context (duplicate React/context bundle or provider order bug). Using loading fallback — hard-refresh the dev server if this persists.",
		);
	}
	return PORTFOLIO_CONTEXT_FALLBACK;
}

export default PortfolioContext;
