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
import { useEffect } from "react";
import { toCentsString } from "./utils/formatCurrency";

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
