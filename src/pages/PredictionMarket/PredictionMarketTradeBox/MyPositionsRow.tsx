import React, { useState } from "react";
import SpinningLoader from "@/components/Common/SpinningLoader";
import { getChartStrokeColorForDarkBg } from "@/helpers/predictionUtils";
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { TradingVenue } from "./types";
import { formatShareCountDataQa, formatShareCountDisplay } from "./checkBalances";

type MarketLike = {
	_id: string;
	questionId?: string;
	marketId?: string;
	displayName?: string;
	question?: string;
	conditionId?: string;
	umbrellaChildrenCount?: number;
};

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
	/** Post-trade sync — hide numeric amount until server-backed balances update. */
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
	const [buyDetailsOpen, setBuyDetailsOpen] = useState<Record<string, boolean>>({});
	const [sellDualDetailsOpen, setSellDualDetailsOpen] = useState<Record<string, boolean>>({});
	const {
		buyLines,
		buyVenueBreakdownByOutcome,
		sellTotalShares,
		sellVenueBreakdown,
		sellOutcomeLabel,
	} = shareBalances;

	/** Same treatment as chart team lines on black: dark team hex is lightened so text stays readable. */
	const colorForLine = (lineSide: "yes" | "no") => {
		if (!isVsSingle) {
			return lineSide === "yes" ? "#22c55e" : "#ef4444";
		}
		const raw = lineSide === "yes" ? yesTeamColor : noTeamColor;
		return getChartStrokeColorForDarkBg(raw, "#ffffff");
	};

	if (side === "buy") {
		const pendingEmptyPosition =
			positionSharesRefreshing && buyLines.length === 0;
		if (buyLines.length === 0 && !pendingEmptyPosition) return null;

		const buyTotalShares = buyLines.reduce(
			(sum, line) => sum + (Number.isFinite(line.shares) ? line.shares : 0),
			0,
		);
		const pendingOutcomeLabel =
			selectedPosition === "no" ? noTeamLabel : yesTeamLabel;
		const pendingLineColor = colorForLine(
			selectedPosition === "no" ? "no" : "yes",
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
					{pendingEmptyPosition ? (
						<div
							style={{
								fontSize: 14,
								fontWeight: 700,
								color: pendingLineColor,
								lineHeight: 1.35,
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: 8,
							}}
						>
							<SpinningLoader size="1rem" />
							<span>Shares {pendingOutcomeLabel}</span>
						</div>
					) : (
						buyLines.map((line) => {
							const breakdown = buyVenueBreakdownByOutcome[line.side];
							const showBuyDetails =
								breakdown.length > 1 && !positionSharesRefreshing;
							const lineDetailsOpen = buyDetailsOpen[line.key] ?? false;
							const headlineRight = `${formatShareCountDisplay(line.shares)} Shares ${line.label}`;
							const headlineContent = positionSharesRefreshing ? (
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "flex-end",
										gap: 8,
									}}
								>
									<SpinningLoader size="1rem" />
									<span>Shares {line.label}</span>
								</span>
							) : (
								headlineRight
							);
							const lineHeadlineColor = colorForLine(line.side);
							const headlineBlock = showBuyDetails ? (
								<button
									type="button"
									onClick={() =>
										setBuyDetailsOpen((o) => ({
											...o,
											[line.key]: !o[line.key],
										}))
									}
									data-qa-line-shares={line.shares}
									data-qa={`my-positions-row-details-toggle-buy-${line.side}`}
									aria-expanded={lineDetailsOpen}
									aria-label={
										lineDetailsOpen
											? "Hide position breakdown"
											: "Show position breakdown"
									}
									style={{
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "flex-end",
										gap: 8,
										background: "none",
										border: "none",
										padding: 0,
										cursor: "pointer",
										fontSize: 14,
										fontWeight: 700,
										lineHeight: 1.35,
										textAlign: "right",
									}}
								>
									<span
										style={{
											fontSize: 10,
											color: "#ffffff",
											transform: lineDetailsOpen
												? "rotate(180deg)"
												: "rotate(0deg)",
											display: "inline-block",
											transition: "transform 0.15s ease",
										}}
										aria-hidden
									>
										▼
									</span>
									<span style={{ color: lineHeadlineColor }}>
										{headlineContent}
									</span>
								</button>
							) : (
								<div
									data-qa="my-positions-buy-headline"
									data-qa-line-shares={line.shares}
									style={{
										fontSize: 14,
										fontWeight: 700,
										color: lineHeadlineColor,
										lineHeight: 1.35,
										display: "flex",
										alignItems: "center",
										justifyContent: "flex-end",
										gap: 8,
									}}
								>
									{headlineContent}
								</div>
							);
							return (
								<div
									key={line.key}
									data-qa="my-positions-buy-line"
									data-qa-line-shares={line.shares}
									style={{
										display: "flex",
										flexDirection: "column",
										alignItems: "flex-end",
										gap: 4,
									}}
								>
									{headlineBlock}
									{showBuyDetails && lineDetailsOpen ? (
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												alignItems: "flex-end",
												gap: 4,
											}}
										>
											{breakdown.map((row) => (
												<div
													key={row.key}
													style={{
														fontSize: 13,
														fontWeight: 600,
														color: "#ffffff",
														lineHeight: 1.35,
													}}
												>
													{formatShareCountDisplay(row.shares)} Shares{" "}
													{line.label} ({row.venueDisplay})
												</div>
											))}
										</div>
									) : null}
								</div>
							);
						})
					)}
				</div>
			</div>
		);
	}

	// Sell
	const headlineColor =
		selectedPosition === "no"
			? colorForLine("no")
			: colorForLine("yes");

	const sellDualBothSides = buyLines.length > 1;

	if (!sellDualBothSides && sellTotalShares <= 0 && !positionSharesRefreshing) {
		return (
			<div
				data-qa="my-positions-row"
				data-qa-side="sell"
				data-qa-shares-count={formatShareCountDataQa(0)}
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

	if (sellDualBothSides) {
		const pendingEmptyDual =
			positionSharesRefreshing && buyLines.length === 0;
		const dualTotalShares = buyLines.reduce(
			(sum, line) => sum + (Number.isFinite(line.shares) ? line.shares : 0),
			0,
		);
		const pendingOutcomeLabel =
			selectedPosition === "no" ? noTeamLabel : yesTeamLabel;
		const pendingLineColor = colorForLine(
			selectedPosition === "no" ? "no" : "yes",
		);

		return (
			<div
				data-qa="my-positions-row"
				data-qa-side="sell"
				data-qa-shares-count={formatShareCountDataQa(dualTotalShares)}
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
					{pendingEmptyDual ? (
						<div
							style={{
								fontSize: 14,
								fontWeight: 700,
								color: pendingLineColor,
								lineHeight: 1.35,
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: 8,
							}}
						>
							<SpinningLoader size="1rem" />
							<span>Shares {pendingOutcomeLabel}</span>
						</div>
					) : (
						buyLines.map((line) => {
							const breakdown = buyVenueBreakdownByOutcome[line.side];
							const showSellDualDetails =
								breakdown.length > 1 && !positionSharesRefreshing;
							const lineDetailsOpen = sellDualDetailsOpen[line.key] ?? false;
							const headlineRight = `${formatShareCountDisplay(line.shares)} Shares ${line.label}`;
							const headlineContent = positionSharesRefreshing ? (
								<span
									style={{
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "flex-end",
										gap: 8,
									}}
								>
									<SpinningLoader size="1rem" />
									<span>Shares {line.label}</span>
								</span>
							) : (
								headlineRight
							);
							const lineHeadlineColor = colorForLine(line.side);
							const headlineBlock = showSellDualDetails ? (
								<button
									type="button"
									onClick={() =>
										setSellDualDetailsOpen((o) => ({
											...o,
											[line.key]: !o[line.key],
										}))
									}
									data-qa={`my-positions-row-details-toggle-sell-dual-${line.side}`}
									aria-expanded={lineDetailsOpen}
									aria-label={
										lineDetailsOpen
											? "Hide position breakdown"
											: "Show position breakdown"
									}
									style={{
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "flex-end",
										gap: 8,
										background: "none",
										border: "none",
										padding: 0,
										cursor: "pointer",
										fontSize: 14,
										fontWeight: 700,
										lineHeight: 1.35,
										textAlign: "right",
									}}
								>
									<span
										style={{
											fontSize: 10,
											color: "#ffffff",
											transform: lineDetailsOpen
												? "rotate(180deg)"
												: "rotate(0deg)",
											display: "inline-block",
											transition: "transform 0.15s ease",
										}}
										aria-hidden
									>
										▼
									</span>
									<span style={{ color: lineHeadlineColor }}>
										{headlineContent}
									</span>
								</button>
							) : (
								<div
									style={{
										fontSize: 14,
										fontWeight: 700,
										color: lineHeadlineColor,
										lineHeight: 1.35,
										display: "flex",
										alignItems: "center",
										justifyContent: "flex-end",
										gap: 8,
									}}
								>
									{headlineContent}
								</div>
							);
							return (
								<div
									key={line.key}
									style={{
										display: "flex",
										flexDirection: "column",
										alignItems: "flex-end",
										gap: 4,
									}}
								>
									{headlineBlock}
									{showSellDualDetails && lineDetailsOpen ? (
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												alignItems: "flex-end",
												gap: 4,
											}}
										>
											{breakdown.map((row) => (
												<div
													key={row.key}
													style={{
														fontSize: 13,
														fontWeight: 600,
														color: "#ffffff",
														lineHeight: 1.35,
													}}
												>
													{formatShareCountDisplay(row.shares)} Shares{" "}
													{line.label} ({row.venueDisplay})
												</div>
											))}
										</div>
									) : null}
								</div>
							);
						})
					)}
				</div>
			</div>
		);
	}

	const headlineRight = `${formatShareCountDisplay(sellTotalShares)} Shares ${sellOutcomeLabel}`;
	const headlineContent = positionSharesRefreshing ? (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "flex-end",
				gap: 8,
			}}
		>
			<SpinningLoader size="1rem" />
			<span>Shares {sellOutcomeLabel}</span>
		</span>
	) : (
		headlineRight
	);
	const showDetails =
		sellVenueBreakdown.length > 1 && !positionSharesRefreshing;

	const headlineBlock =
		showDetails ? (
			<button
				type="button"
				onClick={() => setDetailsOpen((o) => !o)}
				data-qa="my-positions-row-details-toggle"
				aria-expanded={detailsOpen}
				aria-label={
					detailsOpen ? "Hide position breakdown" : "Show position breakdown"
				}
				style={{
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "flex-end",
					gap: 8,
					background: "none",
					border: "none",
					padding: 0,
					cursor: "pointer",
					fontSize: 14,
					fontWeight: 700,
					lineHeight: 1.35,
					textAlign: "right",
				}}
			>
				<span
					style={{
						fontSize: 10,
						color: "#ffffff",
						transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)",
						display: "inline-block",
						transition: "transform 0.15s ease",
					}}
					aria-hidden
				>
					▼
				</span>
				<span style={{ color: headlineColor }}>{headlineContent}</span>
			</button>
		) : (
			<div
				style={{
					fontSize: 14,
					fontWeight: 700,
					color: headlineColor,
					lineHeight: 1.35,
				}}
			>
				{headlineContent}
			</div>
		);

	return (
		<div
			data-qa="my-positions-row"
			data-qa-side="sell"
			data-qa-shares-count={formatShareCountDataQa(sellTotalShares)}
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
					{headlineBlock}
					{showDetails && detailsOpen ? (
						<div
							style={{
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
										color: "#ffffff",
										lineHeight: 1.35,
									}}
								>
									{formatShareCountDisplay(row.shares)} Shares {sellOutcomeLabel} ({row.venueDisplay})
								</div>
							))}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
