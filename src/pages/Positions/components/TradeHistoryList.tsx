import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import Tooltip from "components/Tooltip/Tooltip";
import { outcomeSideLabelColor } from "@/features/positions/utils/positionHelpers";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { oddsDualLayoutForStyle } from "@/features/odds-display/oddsDisplayFormat";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import {
	getPredictPositionRowLabel,
	isGenericBinaryOutcomeLabel,
} from "@/features/trading/venues/predict/portfolio/predictPositionLabel";
import { floorSharesAtDecimals } from "@/features/trading/utils/floorShares";

interface TradeHistoryListProps {
	orders: ProcessedOrder[];
	marketId: string | string[];
	isExpanded: boolean;
	position?: "Yes" | "No";
	/** For vs / esports markets, show team name (e.g. Keyd) instead of Yes/No */
	positionDisplayLabel?: string;
	/** Match title — used to map each fill’s Yes/No to the correct team name */
	marketTitle?: string;
}

export default function TradeHistoryList({
	orders,
	marketId,
	isExpanded,
	position,
	positionDisplayLabel,
	marketTitle,
}: TradeHistoryListProps) {
	const { formatPrice, oddsDisplayStyle } = useOddsDisplay();
	const portfolioPriceLayout = oddsDualLayoutForStyle(oddsDisplayStyle);
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
			return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
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
		// Floor (never round half-up) at 2 dp so a fractional position whose
		// raw value is e.g. 3.3799999 always renders "3.37", never "3.38".
		// `absQty % 1 === 0` keeps whole-number rows showing as "3" rather
		// than "3.00" — pre-existing display behavior.
		const flooredAbs = floorSharesAtDecimals(absQty, 2);
		const formatted = flooredAbs.toLocaleString("en-US", {
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
			style={{
				background: "#0a0a0a",
				borderTop: "2px solid var(--brand-primary)",
				animation: "slideDown 0.25s ease-out",
			}}
		>
			{/* Header - matches parent table structure */}
			<div
				className="grid items-center px-12 py-10"
				style={{
					gridTemplateColumns: "minmax(200px, 2fr) repeat(6, 1fr) 80px",
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
					<Tooltip content="Average execution price" position="top">
						Avg Price
					</Tooltip>
				</div>
				<div style={{ textAlign: "center" }}>Cash Flow</div>
				<div style={{ textAlign: "center" }}>Market</div>
				<div></div>
			</div>

			{/* Trade Rows */}
			{marketOrders.map((order, index) => {
				const isBuy = order.side === "buy";
				const mt = (marketTitle ?? "").trim();
				const op = (order.position ?? "").trim();
				const ol = op.toLowerCase();
				const pdl = order.positionDisplayLabel?.trim();
				const yn = ol === "yes" ? ("Yes" as const) : ol === "no" ? ("No" as const) : null;
				const titleMapped = mt && yn ? getPredictPositionRowLabel(mt, undefined, yn) : "";
				const sideDisplayText =
					yn && mt && isGenericBinaryOutcomeLabel(pdl)
						? titleMapped
						: pdl ||
							(yn && mt ? titleMapped : "") ||
							(positionDisplayLabel?.trim() || op || "").trim();
				// Buy = cash out (negative), Sell = cash in (positive)
				const cashFlow = isBuy ? -order.usdcValue : order.usdcValue;
				const shareChange = isBuy ? order.tokenValue : -order.tokenValue;

				return (
					<div
						key={order.orderId}
						className="grid items-center px-12 py-12"
						style={{
							gridTemplateColumns: "minmax(200px, 2fr) repeat(6, 1fr) 80px",
							borderBottom: "1px solid #1f1f1f",
							fontSize: 14,
							background: index % 2 === 0 ? "#0a0a0a" : "#080808",
							transition: "background 0.15s ease",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#151515";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = index % 2 === 0 ? "#0a0a0a" : "#080808";
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

						{/* Side: team name for vs markets — neutral unless literal Yes/No */}
						<div
							style={{
								textAlign: "center",
								fontWeight: 500,
								color: outcomeSideLabelColor(sideDisplayText, "#22c55e", "#f87171"),
							}}
						>
							{sideDisplayText || "—"}
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
							{formatPrice(order.price, portfolioPriceLayout)}
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

						{/* Market venue */}
						<div
							style={{
								textAlign: "center",
								color: "#888",
								fontSize: 12,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								gap: 6,
							}}
						>
							<MarketLogo venue={order.venue} size={14} />
							<span>{order.venue ?? "LevelUp"}</span>
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
					gridTemplateColumns: "minmax(200px, 2fr) repeat(6, 1fr) 80px",
					background: "#0d0d0d",
					borderTop: "2px solid #1f1f1f",
					fontSize: 13,
				}}
			>
				{/* Trade count */}
				<div style={{ color: "#888", paddingLeft: 60 }}>
					<span style={{ color: "#fff", fontWeight: 600 }}>{marketOrders.length}</span> trade
					{marketOrders.length !== 1 ? "s" : ""}
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

				{/* Empty - Market column */}
				<div></div>

				{/* Empty column */}
				<div></div>
			</div>
		</div>
	);
}
