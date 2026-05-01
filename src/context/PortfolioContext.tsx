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
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useSignerContext } from "context/SignerContext";
import { usePrivy } from "@privy-io/react-auth";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
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
import { getListingYesNoPricesForUmbrella } from "@/helpers/predictionUtils";
import {
	syntheticVenueWinningsRowId,
	useRecentSettlementClaim,
} from "context/RecentSettlementClaimContext";

type PortfolioContextValue = {
	portfolioTotal: number | null;
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
	cashBalance: null,
	loading: true,
	cashLoading: true,
	portfolioLoading: true,
};

let portfolioProviderMissingLogged = false;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
	const { acknowledgedClearedPayoutKeys } = useRecentSettlementClaim();
	const [portfolioTotal, setPortfolioTotal] = useState<number | null>(null);
	/** Mark-to-market (LevelUp books) + off-chain venue — excludes unclaimed resolution value. */
	const lastMarkToMarketAndVenueRef = React.useRef<number>(0);
	/** Last full "positions" column (mtm+venue+LevelUp unclaimed) — for snap-to-zero guard only. */
	const lastPortfolioPositionColumnRef = React.useRef<number>(0);
	const { account, signerAddress } = useSignerContext();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	} = usePredictionData();
	const { appState } = useOddsMonitor();
	const { tokenBalances, loading: userDataLoading } = useUserData();
	const collateral = useCollateralTokens();

	const {
		polymarketSafe,
		solanaAddress,
		limitlessMakerBase,
	} = useFundingAddresses();
	const { authenticated } = usePrivy();
	const dflowProof = useDflowProofStatus();
	const solanaLinked = Boolean(solanaAddress?.trim());

	const polyPositionsQuery = usePolymarketPositions(polymarketSafe);
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
	const predictPositionsQuery = usePredictPositions(predictQueryAddress ?? null);
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
		predictPortfolioMarketIds.length > 0,
	);
	const predictPositionsTotal = useMemo(() => {
		if (!predictPositionsDataNetClaim) return 0;
		return sumPredictPositionMarkValue(
			predictPositionsDataNetClaim,
			umbrellas,
			getQuestionsForUmbrella,
			appState?.markets,
			predictMarketDetailsPortfolioQuery.data ?? null,
		);
	}, [
		predictPositionsDataNetClaim,
		umbrellas,
		getQuestionsForUmbrella,
		appState?.markets,
		predictMarketDetailsPortfolioQuery.data,
	]);

	const privateApi = usePrivateApiClient();
	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;
	const dflowPositionsQuery = useDflowPositions(
		solanaAddress,
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
		Boolean(authenticated) && Boolean(limitlessMakerBase?.trim());
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

	// Track portfolio loading state separately. Cash loading comes from `collateral.isFetched`.
	const [hasInitialPortfolioLoad, setHasInitialPortfolioLoad] =
		React.useState(false);
	const initialLoadTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

	// Reset loading state when account changes
	React.useEffect(() => {
		setHasInitialPortfolioLoad(false);
		lastMarkToMarketAndVenueRef.current = 0;
		lastPortfolioPositionColumnRef.current = 0;
		if (initialLoadTimeoutRef.current) {
			clearTimeout(initialLoadTimeoutRef.current);
			initialLoadTimeoutRef.current = null;
		}
	}, [account]);

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

	// Cash loading is now driven entirely by the single CollateralTokenContext query —
	// either pending or not yet fetched once for the current address set.
	const cashLoading = Boolean(account) && !collateral.isFetched;
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
		dflowBlockingPortfolio;

	// Single sum from CollateralTokenContext — `null` until that query has settled at least once.
	const cashBalance: number | null = useMemo(() => {
		if (!collateral.isFetched) return null;
		return (
			collateral.baseUsdc +
			collateral.polygonStable +
			collateral.bscUsdt +
			collateral.solanaUsdc +
			collateral.limitlessMakerUsdc
		);
	}, [
		collateral.isFetched,
		collateral.baseUsdc,
		collateral.polygonStable,
		collateral.bscUsdt,
		collateral.solanaUsdc,
		collateral.limitlessMakerUsdc,
	]);

	const compute = useCallback(() => {
		if (!account) {
			setPortfolioTotal(0);
			return;
		}

		try {
			let markToMarket = 0;
			umbrellas.forEach((u: any) => {
				const { yes: yp, no: np } = getListingYesNoPricesForUmbrella(
					u,
					appState?.markets,
				);
				const hasPrice = typeof yp === "number" || typeof np === "number";
				const marketList = getQuestionsForUmbrella(u._id) as any[];
				marketList.forEach((m: any) => {
					const balanceId = m?._id;
					if (!balanceId) return;
					const tb = tokenBalances.get(balanceId);
					if (!tb) return;
					const yes = Number(tb.yesBalance) || 0;
					const no = Number(tb.noBalance) || 0;
					if (!hasPrice) return;
					const yv = typeof yp === "number" ? yes * yp : 0;
					const nv = typeof np === "number" ? no * np : 0;
					markToMarket += yv + nv;
				});
			});

			// Off-chain venue notionals
			markToMarket +=
				polyPositionsTotal +
				predictPositionsTotal +
				dflowPositionsTotal +
				limitlessPositionsTotal;

			const prevMtmv = lastMarkToMarketAndVenueRef.current;
			const prevForZeroGuard = lastPortfolioPositionColumnRef.current;
			const nextMtmv = markToMarket;
			lastMarkToMarketAndVenueRef.current = nextMtmv;
			// Unclaimed LevelUp resolution ($1 / winning share) — one addition per recompute
			const positionColumnWithResolved =
				nextMtmv + levelUpResolvedWinningsTotal;
			lastPortfolioPositionColumnRef.current = positionColumnWithResolved;
			// Cash side comes from the single CollateralTokenContext snapshot.
			// While `cashBalance` is null (first load), keep `portfolioTotal` null too
			// rather than displaying a partial total without cash included.
			if (cashBalance === null) {
				return;
			}
			const nextTotal = cashBalance + positionColumnWithResolved;
			setPortfolioTotal((current) => {
				if (
					current !== null &&
					nextTotal === 0 &&
					(cashBalance > 0 || prevForZeroGuard > 0)
				) {
					return current;
				}
				return nextTotal;
			});
		} catch (err) {
			console.error("error", err);
			setPortfolioTotal((current) => current ?? cashBalance);
		}
	}, [
		account,
		umbrellas,
		getQuestionsForUmbrella,
		tokenBalances,
		cashBalance,
		appState?.markets,
		polyPositionsTotal,
		predictPositionsTotal,
		dflowPositionsTotal,
		limitlessPositionsTotal,
		levelUpResolvedWinningsTotal,
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
		cashBalance,
		umbrellas,
		appState?.markets,
		userDataLoading,
		compute,
		polyPositionsTotal,
		predictPositionsTotal,
		dflowPositionsTotal,
		limitlessPositionsTotal,
		levelUpResolvedWinningsTotal,
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
