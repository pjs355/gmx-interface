import React from "react";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import Tooltip from "components/Tooltip/Tooltip";
import { outcomeSideLabelColor } from "../utils/positionHelpers";

interface TradeHistoryListMobileProps {
	orders: ProcessedOrder[];
	marketId: string | string[];
	isExpanded: boolean;
	position?: "Yes" | "No";
	/** For vs / esports markets, show team name (e.g. Keyd) instead of Yes/No */
	positionDisplayLabel?: string;
}

export default function TradeHistoryListMobile({
	orders,
	marketId,
	isExpanded,
	position,
	positionDisplayLabel,
}: TradeHistoryListMobileProps) {
	const ids = Array.isArray(marketId) ? marketId : [marketId];
	const marketOrders = orders
		.filter((order) => {
			if (!ids.includes(order.questionId) || !order.filled) return false;
			if (position && order.position?.toLowerCase() !== position.toLowerCase()) return false;
			return true;
		})
		.sort((a, b) => {
			const ta = new Date(a.filledAt || a.createdAt).getTime();
			const tb = new Date(b.filledAt || b.createdAt).getTime();
			return (
				(Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
			);
		});

	if (!isExpanded || marketOrders.length === 0) {
		return null;
	}

	const formatDate = (dateStr: string | null): string => {
		if (!dateStr) return "—";
		const date = new Date(dateStr);
		if (Number.isNaN(date.getTime())) return "—";
		return date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	const formatPrice = (price: number): string => {
		return `${Math.round(price * 100)}¢`;
	};

	const formatCurrency = (value: number, showSign: boolean = false): string => {
		if (!isFinite(value)) return "—";
		const absValue = Math.abs(value);
		const formatted = absValue.toLocaleString("en-US", {
			minimumFractionDigits: absValue % 1 === 0 ? 0 : 2,
			maximumFractionDigits: 2,
		});
		if (showSign) {
			return value >= 0 ? `+$${formatted}` : `-$${formatted}`;
		}
		return `$${formatted}`;
	};

	const formatQuantity = (qty: number, showSign: boolean = false): string => {
		if (!isFinite(qty)) return "—";
		const absQty = Math.abs(qty);
		const formatted = absQty.toLocaleString("en-US", {
			minimumFractionDigits: absQty % 1 === 0 ? 0 : 2,
			maximumFractionDigits: 2,
		});
		if (showSign) {
			return qty >= 0 ? `+${formatted}` : `-${formatted}`;
		}
		return formatted;
	};

	// Calculate totals
	const totalCashOut = marketOrders
		.filter((o) => o.side === "buy")
		.reduce((sum, o) => sum + o.usdcValue, 0);
	const totalCashIn = marketOrders
		.filter((o) => o.side === "sell")
		.reduce((sum, o) => sum + o.usdcValue, 0);
	const netCashFlow = totalCashIn - totalCashOut;
	const totalSharesBought = marketOrders
		.filter((o) => o.side === "buy")
		.reduce((sum, o) => sum + o.tokenValue, 0);
	const totalSharesSold = marketOrders
		.filter((o) => o.side === "sell")
		.reduce((sum, o) => sum + o.tokenValue, 0);
	const netShares = totalSharesBought - totalSharesSold;

	return (
		<div
			className="trade-history-mobile-container"
			style={{
				background: "#0a0a0a",
				borderTop: "2px solid #8b5cf6",
				padding: "12px",
			}}
		>
			{/* Section Header */}
			{/* Trade Cards */}
			<div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
				{marketOrders.map((order) => {
					const isBuy = order.side === "buy";
					const sideText = (
						positionDisplayLabel?.trim() ||
						order.position ||
						""
					).trim();
					const tl = sideText.toLowerCase();
					const binaryYesNoBg =
						tl === "yes"
							? "rgba(34, 197, 94, 0.15)"
							: tl === "no"
								? "rgba(248, 113, 113, 0.15)"
								: "transparent";
					const cashFlow = isBuy ? -order.usdcValue : order.usdcValue;
					const shareChange = isBuy ? order.tokenValue : -order.tokenValue;

					return (
						<div
							key={order.orderId}
							style={{
								background: "#111",
								borderRadius: 8,
								padding: "12px",
								border: "1px solid #1f1f1f",
							}}
						>
							{/* Top row: Action + Side + Date */}
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									marginBottom: 10,
								}}
							>
								<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
									{/* Buy/Sell text */}
									<span
										style={{
											color: isBuy ? "#16a34a" : "#ef4444",
											fontSize: 13,
											fontWeight: 600,
										}}
									>
										{isBuy ? "Buy" : "Sell"}
									</span>
								{/* Team / Yes/No with faded background */}
								<span
									style={{
										color: outcomeSideLabelColor(
											sideText,
											"#22c55e",
											"#f87171",
										),
										fontSize: 12,
										fontWeight: 600,
										background: binaryYesNoBg,
										padding: "2px 6px",
										borderRadius: 4,
									}}
								>
									{sideText || "—"}
								</span>
								</div>
								<span style={{ color: "#666", fontSize: 11 }}>
									{formatDate(order.filledAt || order.createdAt)}
								</span>
							</div>

						{/* Bottom row: Details */}
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "1fr 1fr 1fr",
								gap: 8,
							}}
						>
							<div>
								<div
									style={{
										color: "#666",
										fontSize: 10,
										textTransform: "uppercase",
										marginBottom: 2,
									}}
								>
									Shares
								</div>
								<div
									style={{
										color: isBuy ? "#22c55e" : "#f87171",
										fontSize: 14,
										fontWeight: 600,
									}}
								>
									{formatQuantity(shareChange, true)}
								</div>
							</div>
							<div style={{ textAlign: "center" }}>
								<div
									style={{
										color: "#666",
										fontSize: 10,
										textTransform: "uppercase",
										marginBottom: 2,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										gap: 4,
									}}
								>
									Avg Price
									<Tooltip
										content="Average execution price"
										position="top"
										closeOnDoubleClick
									>
										<span style={{ 
											fontSize: 10, 
											color: "#888",
											cursor: "pointer",
											padding: "2px 4px",
										}}>
											ⓘ
										</span>
									</Tooltip>
								</div>
								<div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>
									{formatPrice(order.price)}
								</div>
							</div>
							<div style={{ textAlign: "right" }}>
								<div
									style={{
										color: "#666",
										fontSize: 10,
										textTransform: "uppercase",
										marginBottom: 2,
									}}
								>
									Cash Flow
								</div>
								<div
									style={{
										color: cashFlow >= 0 ? "#22c55e" : "#f87171",
										fontSize: 14,
										fontWeight: 700,
									}}
								>
									{formatCurrency(cashFlow, true)}
								</div>
							</div>
						</div>
						{/* Market venue */}
						<div style={{ marginTop: 8, textAlign: "right" }}>
							<span style={{ color: "#666", fontSize: 10, textTransform: "uppercase" }}>Market: </span>
							<span style={{ color: "#888", fontSize: 12 }}>{order.venue ?? "LevelUp"}</span>
						</div>
						</div>
					);
				})}
			</div>

			{/* Summary Footer - simple line separator */}
			<div
				style={{
					marginTop: 12,
					paddingTop: 12,
					borderTop: "1px solid #333",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "flex-start",
				}}
			>
				<div>
					<div style={{ color: "#666", fontSize: 11, marginBottom: 2 }}>
						Net Shares
					</div>
					<div
						style={{
							color:
								netShares > 0
									? "#22c55e"
									: netShares < 0
									? "#f87171"
									: "#fff",
							fontSize: 14,
							fontWeight: 500,
						}}
					>
						{formatQuantity(netShares, true)}
					</div>
				</div>
				<div style={{ textAlign: "right" }}>
					<div style={{ color: "#666", fontSize: 11, marginBottom: 2 }}>
						Net Cash Flow
					</div>
					<div
						style={{
							color: netCashFlow >= 0 ? "#22c55e" : "#f87171",
							fontSize: 14,
							fontWeight: 500,
						}}
					>
						{formatCurrency(netCashFlow, true)}
					</div>
				</div>
			</div>
		</div>
	);
}
