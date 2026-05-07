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
import { useAccountData } from "@/context/AccountDataContext";
import { limitlessPositionsForPortfolioMtm } from "@/trading/limitless/splitLimitlessVenuePositions";
import { sumPredictPositionMarkValue } from "@/trading/predict/sumPredictPositionMarkValue";
import { usePredictMarketDetailsMap } from "@/trading/predict/usePredictMarketDetailsMap";
import { debugLimitlessPortfolioTable } from "@/trading/limitless/limitlessPortfolioDebug";
import { isVenueMarketResolvedLike } from "@/types/trading/venuePosition";
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
	const { account } = useSignerContext();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	} = usePredictionData();
	const { appState } = useOddsMonitor();
	const { tokenBalances, loading: userDataLoading } = useUserData();
	const collateral = useCollateralTokens();

	const { positions, dflowProof, addresses } = useAccountData();
	const { authenticated } = usePrivy();
	const solanaLinked = Boolean(addresses.solanaAddress?.trim());
	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;

	const polyPositionsDataNetClaim = useMemo(() => {
		return positions.polymarket.rows.filter(
			(p) =>
				!acknowledgedClearedPayoutKeys.has(
					syntheticVenueWinningsRowId("polymarket", p.tokenId),
				),
		);
	}, [acknowledgedClearedPayoutKeys, positions.polymarket.rows]);
	const polyPositionsTotal = useMemo(() => {
		return polyPositionsDataNetClaim.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0,
		);
	}, [polyPositionsDataNetClaim]);

	// Match `AccountDataProvider` + Positions: Predict.fun keys off the embedded signer (BNB),
	// not the Base smart wallet.
	const predictPositionsDataNetClaim = useMemo(() => {
		return positions.predict.rows.filter(
			(p) =>
				!acknowledgedClearedPayoutKeys.has(
					syntheticVenueWinningsRowId("predictfun", p.tokenId),
				),
		);
	}, [acknowledgedClearedPayoutKeys, positions.predict.rows]);
	const predictPortfolioMarketIds = useMemo(() => {
		const ids = new Set<number>();
		for (const p of predictPositionsDataNetClaim) {
			if (p.numericMarketId) ids.add(p.numericMarketId);
		}
		return Array.from(ids);
	}, [predictPositionsDataNetClaim]);
	const predictMarketDetailsPortfolioQuery = usePredictMarketDetailsMap(
		predictPortfolioMarketIds,
		predictPortfolioMarketIds.length > 0,
	);
	const predictPositionsTotal = useMemo(() => {
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

	const dflowPositionsTotal = useMemo(() => {
		return positions.dflow.rows.reduce(
			(sum, p) => sum + (p.currentValue ?? 0),
			0,
		);
	}, [positions.dflow.rows]);

	const limitlessPositionsDataNetClaim = useMemo(() => {
		const mtm = limitlessPositionsForPortfolioMtm(positions.limitless.rows);
		return mtm.filter(
			(p) =>
				!acknowledgedClearedPayoutKeys.has(
					syntheticVenueWinningsRowId("limitless", p.tokenId),
				),
		);
	}, [acknowledgedClearedPayoutKeys, positions.limitless.rows]);
	const limitlessPositionsTotal = useMemo(() => {
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

	// Reset position-tracking refs when account changes so a fresh login can't
	// inherit the previous user's snap-to-zero floor.
	React.useEffect(() => {
		lastMarkToMarketAndVenueRef.current = 0;
		lastPortfolioPositionColumnRef.current = 0;
	}, [account]);

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
		positions.dflow.status === "pending";

	/**
	 * Portfolio is "loading" only while the underlying queries that feed
	 * `cashBalance` + LevelUp shares haven't settled at least once. The old
	 * `setHasInitialPortfolioLoad` + 2-second `setTimeout` fallback existed
	 * because new users with no positions never tripped the
	 * `portfolioTotal !== null` write; gating directly on the fetch states
	 * gets us out of "loading" deterministically (cash:0 + positions:0 is a
	 * valid loaded state for a fresh wallet).
	 */
	const portfolioLoading =
		Boolean(account) &&
		(cashLoading ||
			(userDataLoading && tokenBalances.size === 0) ||
			dflowBlockingPortfolio);

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
	// In dev we keep the loading-shaped fallback so HMR or accidental
	// detachment doesn't crash the app while you're iterating. In production
	// a missing provider is a bug — silently returning fake "loading" data
	// would mask broken portfolio displays for real users.
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

export default PortfolioContext;
