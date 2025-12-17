import React from "react";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import Tooltip from "components/Tooltip/Tooltip";

interface TradeHistoryListProps {
	orders: ProcessedOrder[];
	marketId: string;
	isExpanded: boolean;
	position?: "Yes" | "No"; // Filter by Yes or No trades
}

/**
 * TradeHistoryList - Desktop component that displays all trades for a specific market
 * Shows: Date, Type (Buy/Sell), Side (Yes/No), Shares, Price, Cash Flow
 */
export default function TradeHistoryList({
	orders,
	marketId,
	isExpanded,
	position,
}: TradeHistoryListProps) {
	// Filter orders for this specific market and only show filled orders
	// If position is provided, also filter by Yes/No (case-insensitive)
	const marketOrders = orders
		.filter((order) => {
			if (order.questionId !== marketId || !order.filled) return false;
			if (position && order.position?.toLowerCase() !== position.toLowerCase()) return false;
			return true;
		})
		.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
		);

	if (!isExpanded || marketOrders.length === 0) {
		return null;
	}

	const formatDate = (dateStr: string | null): string => {
		if (!dateStr) return "—";
		const date = new Date(dateStr);
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

	// Reverse for display (newest first)
	const displayOrders = [...marketOrders].reverse();

	return (
		<div
			style={{
				background: "#0a0a0a",
				borderTop: "2px solid #8b5cf6",
				animation: "slideDown 0.25s ease-out",
			}}
		>
			{/* Header - matches parent table structure */}
			<div
				className="grid items-center px-12 py-10"
				style={{
					gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr) 80px",
					background: "#0d0d0d",
					color: "#666",
					fontSize: 11,
					textTransform: "uppercase",
					letterSpacing: 0.6,
					borderBottom: "1px solid #1f1f1f",
				}}
			>
				<div style={{ paddingLeft: 60 }}>Trade Date</div>
				<div style={{ textAlign: "center" }}>Action</div>
				<div style={{ textAlign: "center" }}>Side</div>
				<div style={{ textAlign: "center" }}>Shares</div>
				<div style={{ textAlign: "center" }}>
					<Tooltip
						content="Average execution price"
						position="top"
					>
						Avg Price
					</Tooltip>
				</div>
				<div style={{ textAlign: "center" }}>Cash Flow</div>
				<div></div>
			</div>

			{/* Trade Rows */}
			{displayOrders.map((order, index) => {
				const isBuy = order.side === "buy";
				const isYes = order.position === "Yes";
				// Buy = cash out (negative), Sell = cash in (positive)
				const cashFlow = isBuy ? -order.usdcValue : order.usdcValue;
				const shareChange = isBuy ? order.tokenValue : -order.tokenValue;

				return (
					<div
						key={order.orderId}
						className="grid items-center px-12 py-12"
						style={{
							gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr) 80px",
							borderBottom: "1px solid #1f1f1f",
							fontSize: 14,
							background: index % 2 === 0 ? "#0a0a0a" : "#080808",
							transition: "background 0.15s ease",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#151515";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background =
								index % 2 === 0 ? "#0a0a0a" : "#080808";
						}}
					>
						{/* Date */}
						<div style={{ color: "#888", paddingLeft: 60 }}>
							{formatDate(order.filledAt || order.createdAt)}
						</div>

						{/* Action (Buy/Sell) - simple text */}
						<div
							style={{
								textAlign: "center",
								fontWeight: 600,
								color: isBuy ? "#16a34a" : "#ef4444",
							}}
						>
							{isBuy ? "Buy" : "Sell"}
						</div>

						{/* Side (Yes/No) - simple text */}
						<div
							style={{
								textAlign: "center",
								fontWeight: 500,
								color: isYes ? "#22c55e" : "#f87171",
							}}
						>
							{order.position}
						</div>

						{/* Shares with +/- */}
						<div
							style={{
								textAlign: "center",
								color: isBuy ? "#22c55e" : "#f87171",
								fontWeight: 500,
							}}
						>
							{formatQuantity(shareChange, true)}
						</div>

						{/* Price */}
						<div style={{ textAlign: "center", color: "#fff" }}>
							{formatPrice(order.price)}
						</div>

						{/* Cash Flow with clear in/out indicator */}
						<div
							style={{
								textAlign: "center",
								fontWeight: 600,
								color: cashFlow >= 0 ? "#22c55e" : "#f87171",
							}}
						>
							{formatCurrency(cashFlow, true)}
						</div>

						{/* Empty column to match parent grid */}
						<div></div>
					</div>
				);
			})}

			{/* Summary Footer - aligned with columns */}
			<div
				className="grid items-center px-12 py-12"
				style={{
					gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr) 80px",
					background: "#0d0d0d",
					borderTop: "2px solid #1f1f1f",
					fontSize: 13,
				}}
			>
				{/* Trade count */}
				<div style={{ color: "#888", paddingLeft: 60 }}>
					<span style={{ color: "#fff", fontWeight: 600 }}>
						{marketOrders.length}
					</span>{" "}
					trade{marketOrders.length !== 1 ? "s" : ""}
				</div>

				{/* Empty - Action column */}
				<div></div>

				{/* Empty - Side column */}
				<div></div>

				{/* Net Shares - aligned with Shares column */}
				<div style={{ textAlign: "center" }}>
					<span style={{ color: "#888", fontSize: 11 }}>NET: </span>
					<span
						style={{
							color: netShares > 0 ? "#22c55e" : netShares < 0 ? "#f87171" : "#fff",
							fontWeight: 600,
						}}
					>
						{formatQuantity(netShares, true)}
					</span>
				</div>

				{/* Empty - Price column */}
				<div></div>

				{/* Net Cash Flow - aligned with Cash Flow column */}
				<div style={{ textAlign: "center" }}>
					<span style={{ color: "#888", fontSize: 11 }}>NET: </span>
					<span
						style={{
							color: netCashFlow >= 0 ? "#22c55e" : "#f87171",
							fontWeight: 700,
						}}
					>
						{formatCurrency(netCashFlow, true)}
					</span>
				</div>

				{/* Empty column */}
				<div></div>
			</div>
		</div>
	);
}
