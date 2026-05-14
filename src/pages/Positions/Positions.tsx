import { useMedia } from "react-use";
import "./Positions.scss";
import PositionsHeader from "./components/PositionsHeader";
import PositionsTabs from "./components/PositionsTabs";
import PositionsTableView from "./components/PositionsTableView";
import PositionsCardView from "./components/PositionsCardView";
import ResolvedPositionsTable from "./components/ResolvedPositionsTable";
import ResolvedPositionsCardView from "./components/ResolvedPositionsCardView";
// import OrdersView from "./components/OrdersView";
// import OrdersCardView from "./components/OrdersCardView";
import HistoryView from "./components/HistoryView";
import HistoryCardView from "./components/HistoryCardView";
import BalanceChecker from "./components/BalanceChecker";
import { usePositionsPageData } from "@/context/PositionsDataContext";
import { usePositionsPageMetricsGate } from "@/context/PositionsPageMetricsGateContext";
import { useClaimCashSyncPending } from "@/trading/sor/usePostTradeBalanceSync";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useEffect } from "react";
import { toCentsString } from "./utils/formatCurrency";
import type { MarketPosition } from "./utils/positionHelpers";
import { shortTeamDisplayName } from "./utils/historyOutcomeWinner";
import { isLimitlessWinningsTabClaimBlocked } from "@/trading/limitless/limitlessClaimAck";

/** Human-readable match / market winner for Winnings debug logs (mirrors ResolvedPositionsTable label routing). */
function winningsDebugWhoWon(
	market: PredictionMarket,
	mp: Pick<
		MarketPosition,
		"venue" | "predictOutcomeLabelYes" | "predictOutcomeLabelNo"
	>,
	winningSide: "Yes" | "No",
): string {
	if (
		mp.venue === "predictfun" ||
		mp.venue === "dflow" ||
		mp.venue === "limitless" ||
		mp.venue === "polymarket"
	) {
		const label =
			winningSide === "Yes" ? mp.predictOutcomeLabelYes : mp.predictOutcomeLabelNo;
		if (label?.trim()) return label.trim();
	}
	const title = (market.displayName || market.question || "").trim();
	const parts = title.split(/\s*vs\.?\s*/i).map((s) => s.trim()).filter(Boolean);
	if (parts.length === 2) {
		return shortTeamDisplayName(winningSide === "Yes" ? parts[0]! : parts[1]!);
	}
	return winningSide;
}

function SkeletonRow({ widths, height = 16 }: { widths: number[]; height?: number }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0" }}>
			{widths.map((w, i) => (
				<span key={i} className="skeleton-box" style={{ width: w, height, borderRadius: 4 }} />
			))}
		</div>
	);
}

function PortfolioSkeleton() {
	return (
		<div className="positions-portfolio-skeleton" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					key={i}
					style={{
						borderBottom: "1px solid #1a1a1a",
						padding: "12px 0",
						display: "flex",
						alignItems: "center",
						gap: 16,
					}}
				>
					<span className="skeleton-box" style={{ width: 48, height: 48, borderRadius: 8, flexShrink: 0 }} />
					<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
						<span className="skeleton-box" style={{ width: `${60 - i * 8}%`, maxWidth: 280, height: 16, borderRadius: 4 }} />
						<SkeletonRow widths={[60, 50, 70, 80, 70, 90]} height={14} />
					</div>
				</div>
			))}
		</div>
	);
}

export default function Positions() {
	const isMobile = useMedia("(max-width: 768px)");

	const data = usePositionsPageData();

	const {
		account,
		isDebugMode,
		debugAccount,
		realAccount,
		// isDataFullyLoaded, // used when Orders tab shell fell back to full-data gate
		isPositionsTabContentReady,
		isHistoryTabContentReady,
		portfolioLoading,
		cashBalanceCtx,
		portfolioCashLoading,
		positionsTotalValue,
		portfolioTotalCtx,
		umbrellaPositions,
		resolvedUmbrellaPositions,
		umbrellaBalancesPositions,
		// umbrellaBalancesOrders, // Orders tab (commented out)
		combinedOrders,
		// venueOrders,
		venueHistory,
		venueHistoryRawItemsForDebug,
		historyCatalogUmbrellas,
		historyResolveStage,
		returnsByQid,
		aggregates,
		spentByQid,
		getCurrentPriceForSide,
		handleClaimSuccess,
		// orders, // LevelUp open orders — Orders tab only
		resolvedMarketsByUmbrella,
		activeTab,
		setActiveTab,
	} = data;

	const claimCashSyncPending = useClaimCashSyncPending();

	/** Orders tab removed from UI — normalize stale state (e.g. hot-reload) so a tab stays selected. */
	useEffect(() => {
		if (activeTab === "orders") setActiveTab("positions");
	}, [activeTab, setActiveTab]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		if (resolvedUmbrellaPositions.length === 0) return;
		const winnings = resolvedUmbrellaPositions.flatMap((up) =>
			up.markets.map((mp) => {
				const m = mp.market;
				const outcome = String(
					(m as { resolvedOutcome?: string }).resolvedOutcome || "",
				).toLowerCase();
				const winningSide: "Yes" | "No" | null =
					outcome === "yes" ? "Yes" : outcome === "no" ? "No" : null;
				const marketTitle =
					(m as { displayName?: string }).displayName?.trim() ||
					m.question?.trim() ||
					m.questionId ||
					m._id;
				const whoWonTheMatch = winningSide
					? winningsDebugWhoWon(m, mp, winningSide)
					: "(unknown resolved outcome)";
				const payoutUsd =
					outcome === "yes"
						? mp.yesBalance
						: outcome === "no"
							? mp.noBalance
							: 0;
				const venue = mp.venue ?? "levelup";
				const limitlessMeta =
					venue === "limitless"
						? (() => {
								const x = m as {
									_limitlessPartnerRedeemableSignal?: string;
									_limitlessMarketStatusApi?: string;
								};
								return {
									limitlessPartnerRedeemableSignal:
										x._limitlessPartnerRedeemableSignal ?? "omit",
									limitlessMarketStatusApi: x._limitlessMarketStatusApi,
									inAppClaimBlockedByPartnerFalse:
										isLimitlessWinningsTabClaimBlocked(m),
									note: "Shape is LevelUp Winnings-tab projection from resolvedUmbrellaPositions; balances/outcome trace to GET /api/limitless/portfolio/positions-venue (Limitless GET /portfolio/positions via proxy).",
								};
							})()
						: undefined;
				return {
					umbrellaId: up.umbrella._id,
					umbrellaDisplayName: up.umbrella.displayName,
					venue,
					marketId: m._id,
					marketTitle,
					questionId: m.questionId,
					conditionId: m.conditionId,
					resolvedOutcomeYesNo: outcome,
					whoWonTheMatch,
					yesShares: mp.yesBalance,
					noShares: mp.noBalance,
					yourWinningSide: winningSide,
					yourWinningShares: payoutUsd,
					estimatedPayoutUsd: payoutUsd,
					...(limitlessMeta ? { limitlessHandler: limitlessMeta } : {}),
				};
			}),
		);
		console.debug("[Limitless / winnings-tab handler → Positions.tsx]", {
			rowCount: winnings.length,
			winnings,
		});
	}, [resolvedUmbrellaPositions]);

	/** Tab-scoped body skeleton; header cash stays independent via `PositionsHeader`. */
	const pageContentLoading =
		activeTab === "positions" || activeTab === "orders"
			? !isPositionsTabContentReady
			: activeTab === "history"
				? !isHistoryTabContentReady
				: !isPositionsTabContentReady;

	const { setBlockHeaderMetrics } = usePositionsPageMetricsGate();
	useEffect(() => {
		if (!account) {
			setBlockHeaderMetrics(false);
			return;
		}
		setBlockHeaderMetrics(pageContentLoading);
		return () => setBlockHeaderMetrics(false);
	}, [account, pageContentLoading, setBlockHeaderMetrics]);

	const renderPositionsTab = () => {
		const hasPositions = umbrellaPositions.length > 0;
		const transformedWinnings = resolvedUmbrellaPositions.map((up) => ({
			umbrella: up.umbrella,
			markets: up.markets.map((mp) => {
				const outcome = String((mp.market as any).resolvedOutcome || "").toLowerCase();
				return {
					market: mp.market,
					yes: outcome === "yes" ? mp.yesBalance.toString() : "0",
					no: outcome === "no" ? mp.noBalance.toString() : "0",
					venue: mp.venue,
					yesLabel: mp.predictOutcomeLabelYes,
					noLabel: mp.predictOutcomeLabelNo,
				};
			}),
		}));

		return (
			<>
				{resolvedUmbrellaPositions.length > 0 && (
					<div className="mb-24">
						<h3 className="mb-6 text-20 font-bold" style={{ color: "#ffffff", fontSize: 34 }}>
							Winnings
						</h3>
						{!isMobile ? (
							<ResolvedPositionsTable
								umbrellaBalances={transformedWinnings}
								toCentsString={toCentsString}
								onClaimSuccess={handleClaimSuccess}
							/>
						) : (
							<ResolvedPositionsCardView
								umbrellaBalances={transformedWinnings}
								toCentsString={toCentsString}
								onClaimSuccess={handleClaimSuccess}
							/>
						)}
					</div>
				)}
				{resolvedUmbrellaPositions.length > 0 && (
					<h3 className="mb-6 text-20 font-bold" style={{ color: "#ffffff", fontSize: 34, marginTop: 40 }}>
						Positions
					</h3>
				)}
				{hasPositions ? (
					!isMobile ? (
						<PositionsTableView
							umbrellaBalances={umbrellaBalancesPositions}
							aggregates={aggregates}
							spentByQid={spentByQid}
							returnsByQid={returnsByQid}
							getCurrentPriceForSide={getCurrentPriceForSide}
							toCentsString={toCentsString}
							orders={combinedOrders}
						/>
					) : (
						<PositionsCardView
							umbrellaBalances={umbrellaBalancesPositions}
							aggregates={aggregates}
							spentByQid={spentByQid}
							returnsByQid={returnsByQid}
							getCurrentPriceForSide={getCurrentPriceForSide}
							toCentsString={toCentsString}
							orders={combinedOrders}
						/>
					)
				) : (
					<p className="text-body" style={{ color: "#888", marginTop: "16px" }}>
						No current positions.
					</p>
				)}
			</>
		);
	};

	/* Orders tab disabled — re-enable with OrdersView / OrdersCardView imports above.
	const renderOrdersTab = () =>
		!isMobile ? (
			<OrdersView umbrellaBalances={umbrellaBalancesOrders} orders={orders || []} venueOrders={venueOrders} />
		) : (
			<OrdersCardView umbrellaBalances={umbrellaBalancesOrders} orders={orders || []} venueOrders={venueOrders} />
		);
	*/

	const renderHistoryTab = () =>
		!isMobile ? (
			<HistoryView
				umbrellaBalances={umbrellaBalancesPositions}
				orders={combinedOrders}
				resolvedMarketsByUmbrella={resolvedMarketsByUmbrella}
				venueHistory={venueHistory}
				venueHistoryRawItemsForDebug={venueHistoryRawItemsForDebug}
				catalogUmbrellas={historyCatalogUmbrellas}
				historyResolveStage={historyResolveStage}
				resolvedUmbrellaPositions={resolvedUmbrellaPositions}
				openUmbrellaPositions={umbrellaPositions}
			/>
		) : (
			<HistoryCardView
				umbrellaBalances={umbrellaBalancesPositions}
				orders={combinedOrders}
				resolvedMarketsByUmbrella={resolvedMarketsByUmbrella}
				venueHistory={venueHistory}
				venueHistoryRawItemsForDebug={venueHistoryRawItemsForDebug}
				catalogUmbrellas={historyCatalogUmbrellas}
				historyResolveStage={historyResolveStage}
				resolvedUmbrellaPositions={resolvedUmbrellaPositions}
				openUmbrellaPositions={umbrellaPositions}
			/>
		);

	return (
		<div className="positions-page page-layout">
			{isDebugMode && (
				<div
					style={{
						background: "linear-gradient(90deg, #ff6b35, #f7931a)",
						color: "white",
						padding: "12px 20px",
						borderRadius: "8px",
						marginBottom: "16px",
						fontWeight: "bold",
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						flexWrap: "wrap",
						gap: "8px",
					}}
				>
					<div>
						<span style={{ fontSize: "16px" }}>DEBUG MODE</span>
						<span style={{ fontWeight: "normal", marginLeft: "12px", fontSize: "14px" }}>
							Viewing portfolio for:{" "}
							<code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 6px", borderRadius: "4px" }}>
								{debugAccount?.slice(0, 6)}...{debugAccount?.slice(-4)}
							</code>
						</span>
					</div>
					<div style={{ fontSize: "12px", fontWeight: "normal", opacity: 0.9 }}>
						{realAccount && (
							<>
								Your account: {realAccount.slice(0, 6)}...{realAccount.slice(-4)} |{" "}
							</>
						)}
						Run{" "}
						<code style={{ background: "rgba(0,0,0,0.2)", padding: "2px 4px", borderRadius: "3px" }}>
							clearSpoof()
						</code>{" "}
						in console to exit
					</div>
				</div>
			)}
			{isDebugMode && debugAccount && <BalanceChecker debugAccount={debugAccount} />}
			<div>
				<div className="positions-header-group">
					<PositionsHeader
						portfolioTotal={
							portfolioTotalCtx != null && Number.isFinite(portfolioTotalCtx)
								? portfolioTotalCtx
								: Number(cashBalanceCtx) + positionsTotalValue
						}
						positionsTotalValue={positionsTotalValue}
						usdcBalance={Number(cashBalanceCtx)}
						cashLoading={portfolioCashLoading || claimCashSyncPending}
						positionsLoading={pageContentLoading}
						portfolioLoading={portfolioLoading}
						summariesLocked={Boolean(account) && pageContentLoading}
					/>
					<PositionsTabs activeTab={activeTab} setActiveTab={setActiveTab} />
				</div>

				<div className="positions-content-wrapper">
					{!account && <p className="text-body">Log in to view balances.</p>}
					{account && (
						<>
							{pageContentLoading ? (
								<PortfolioSkeleton />
							) : activeTab === "positions" || activeTab === "orders" ? (
								renderPositionsTab()
							) : (
								renderHistoryTab()
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
