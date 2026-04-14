import React from "react";
import { useTradeBoxShareBalances } from "./hooks/useTradeBoxShareBalances";
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

function formatShareCount(n: number): string {
	if (!Number.isFinite(n)) return String(n);
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: n % 1 === 0 ? 0 : 4,
		minimumFractionDigits: 0,
	}).format(n);
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
}: {
	market: MarketLike;
	umbrellaId?: string;
	tradingVenue: TradingVenue;
	yesTeamLabel: string;
	noTeamLabel: string;
	isVsSingle: boolean;
	yesTeamColor?: string;
	noTeamColor?: string;
}) {
	const { lines } = useTradeBoxShareBalances({
		umbrellaId,
		market,
		tradingVenue,
		yesTeamLabel,
		noTeamLabel,
		isVsSingle,
	});

	if (lines.length === 0) return null;

	return (
		<div
			style={{
				display: "flex",
				justifyContent: "space-between",
				alignItems: "flex-start",
				gap: 12,
				marginBottom: 16,
			}}
		>
			<div style={{ fontSize: 14, fontWeight: 400, color: "#6B7280", flexShrink: 0 }}>
				My position
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
				{lines.map((line) => {
					const color =
						line.side === "yes"
							? isVsSingle
								? yesTeamColor || "#ffffff"
								: "#22c55e"
							: isVsSingle
								? noTeamColor || "#ffffff"
								: "#ef4444";
					const suffixPart = line.venueSuffix ? ` ${line.venueSuffix}` : "";
					return (
						<div
							key={line.key}
							style={{ fontSize: 14, fontWeight: 700, color, lineHeight: 1.35 }}
						>
							{formatShareCount(line.shares)} shares of {line.label}
							{suffixPart}
						</div>
					);
				})}
			</div>
		</div>
	);
}
