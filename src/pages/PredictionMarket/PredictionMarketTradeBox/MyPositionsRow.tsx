import React, { useState } from "react";
import { getChartStrokeColorForDarkBg } from "@/helpers/predictionUtils";
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { TradingVenue } from "./types";

type MarketLike = {
	_id: string;
	questionId?: string;
	marketId?: string;
	displayName?: string;
	question?: string;
	conditionId?: string;
	umbrellaChildrenCount?: number;
};

/**
 * Display helper — always rounds DOWN so the user never sees a share count
 * larger than what they actually hold. This pairs with the sell-side EPS
 * (`SHARE_SELL_COMPARE_EPS = 0.01`) and the "sell-all clamp" so that typing
 * the displayed amount sells the user's full position (including any
 * fractional remainder hidden by the floor).
 */
function formatShareCount(n: number): string {
	if (!Number.isFinite(n)) return String(n);
	if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-9) {
		return String(Math.round(n));
	}
	const floored = Math.floor(n * 100) / 100;
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: 2,
		minimumFractionDigits: 0,
	}).format(floored);
}

export function MyPositionsRow({
	market,
	umbrellaId,
	tradingVenue,
	yesTeamLabel,
	noTeamLabel,
	isVsSingle,
	yesTeamColor,
	noTeamColor,
	side,
	selectedPosition,
	matchedMonitor,
	shareBalances,
	/** All Markets SOR “Filled” banner is up — position counts may still be catching up on-chain. */
	positionSharesRefreshing = false,
}: {
	market: MarketLike;
	umbrellaId?: string;
	tradingVenue: TradingVenue;
	yesTeamLabel: string;
	noTeamLabel: string;
	isVsSingle: boolean;
	yesTeamColor?: string;
	noTeamColor?: string;
	side: "buy" | "sell";
	selectedPosition: "yes" | "no" | null;
	matchedMonitor?: MatchedMarket | null;
	shareBalances: TradeBoxShareBalancesSnapshot;
	positionSharesRefreshing?: boolean;
}) {
	const [detailsOpen, setDetailsOpen] = useState(false);
	const { buyLines, sellTotalShares, sellVenueBreakdown, sellOutcomeLabel } =
		shareBalances;

	/** Same treatment as chart team lines on black: dark team hex is lightened so text stays readable. */
	const colorForLine = (lineSide: "yes" | "no") => {
		if (!isVsSingle) {
			return lineSide === "yes" ? "#22c55e" : "#ef4444";
		}
		const raw = lineSide === "yes" ? yesTeamColor : noTeamColor;
		return getChartStrokeColorForDarkBg(raw, "#ffffff");
	};

	if (side === "buy") {
		if (buyLines.length === 0) return null;
		const buyTotalShares = buyLines.reduce(
			(sum, line) => sum + (Number.isFinite(line.shares) ? line.shares : 0),
			0,
		);
		return (
			<div
				data-qa="my-positions-row"
				data-qa-side="buy"
				data-qa-shares-count={buyTotalShares}
				data-qa-position-refreshing={positionSharesRefreshing ? "true" : "false"}
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					gap: 12,
					marginBottom: 16,
				}}
			>
				<div style={{ fontSize: 14, fontWeight: 400, color: "#ffffff", flexShrink: 0 }}>
					Your Position:
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 6,
						textAlign: "right",
					}}
				>
					{buyLines.map((line) => (
						<div
							key={line.key}
							style={{
								fontSize: 14,
								fontWeight: 700,
								color: colorForLine(line.side),
								lineHeight: 1.35,
							}}
						>
							{formatShareCount(line.shares)} Shares {line.label}
						</div>
					))}
				</div>
			</div>
		);
	}

	// Sell
	const headlineColor =
		selectedPosition === "no"
			? colorForLine("no")
			: colorForLine("yes");

	if (sellTotalShares <= 0) {
		return (
			<div
				data-qa="my-positions-row"
				data-qa-side="sell"
				data-qa-shares-count={0}
				data-qa-position-refreshing={positionSharesRefreshing ? "true" : "false"}
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					gap: 12,
					marginBottom: 16,
				}}
			>
				<div style={{ fontSize: 14, fontWeight: 400, color: "#ffffff", flexShrink: 0 }}>
					Your Position:
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 6,
					}}
				>
					<div
						style={{
							fontSize: 14,
							fontWeight: 700,
							color: headlineColor,
							lineHeight: 1.35,
						}}
					>
						None
					</div>
				</div>
			</div>
		);
	}

	const headlineRight = `${formatShareCount(sellTotalShares)} Shares ${sellOutcomeLabel}`;
	const showDetails = tradingVenue === "all" && sellVenueBreakdown.length > 1;

	return (
		<div
			data-qa="my-positions-row"
			data-qa-side="sell"
			data-qa-shares-count={sellTotalShares}
			data-qa-position-refreshing={positionSharesRefreshing ? "true" : "false"}
			style={{ marginBottom: 16 }}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
					gap: 12,
				}}
			>
				<div style={{ fontSize: 14, fontWeight: 400, color: "#ffffff", flexShrink: 0 }}>
					Your Position:
				</div>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-end",
						gap: 6,
						textAlign: "right",
					}}
				>
					<div
						style={{
							fontSize: 14,
							fontWeight: 700,
							color: headlineColor,
							lineHeight: 1.35,
						}}
					>
						{headlineRight}
					</div>
				</div>
			</div>
			{showDetails ? (
				<div style={{ marginTop: 8, textAlign: "right" }}>
					<button
						type="button"
						onClick={() => setDetailsOpen((o) => !o)}
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							background: "none",
							border: "none",
							padding: 0,
							cursor: "pointer",
							fontSize: 13,
							fontWeight: 600,
							color: "#9ca3af",
						}}
					>
						<span
							style={{
								fontSize: 10,
								transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)",
								display: "inline-block",
								transition: "transform 0.15s ease",
							}}
						>
							▼
						</span>
						Details
					</button>
					{detailsOpen ? (
						<div
							style={{
								marginTop: 8,
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-end",
								gap: 4,
							}}
						>
							{sellVenueBreakdown.map((row) => (
								<div
									key={row.key}
									style={{
										fontSize: 13,
										fontWeight: 600,
										color: headlineColor,
										lineHeight: 1.35,
									}}
								>
									{formatShareCount(row.shares)} Shares {sellOutcomeLabel} ({row.venueDisplay})
								</div>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
