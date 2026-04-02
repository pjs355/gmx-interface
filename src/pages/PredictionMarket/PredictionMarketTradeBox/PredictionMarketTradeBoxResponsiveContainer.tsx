import { useMemo, useCallback } from "react";
import { useMedia } from "react-use";
import PredictionMarketTradeBoxUI from "./PredictionMarketTradeBoxUI";
import {
	PredictionCurtain,
	useIsCurtainOpen,
	useCurtainActions,
} from "./PredictionCurtain";
import type { ReactNode } from "react";
import type {
	TradeBoxProps,
	TradeBoxState,
	ApprovalState,
	TradingVenue,
	MarketOrderCalculation,
} from "./types";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import Button from "components/Button/Button";

interface PredictionMarketTradeBoxResponsiveContainerProps
	extends TradeBoxProps {
	state: TradeBoxState;
	onPositionChange: (position: "yes" | "no") => void;
	onAmountChange: (amount: string) => void;
	onPriceChange: (price: string) => void;
	onOrderTypeChange: (orderType: "market" | "limit") => void;
	onTradingVenueChange: (venue: TradingVenue) => void;
	polymarketVenueHint?: string | null;
	predictVenueHint?: string | null;
	predictVenueBookHints?: {
		yes: OrderbookSnapshot | null;
		no: OrderbookSnapshot | null;
	} | null;
	dflowVenueHint?: string | null;
	onSideChange: (side: "buy" | "sell") => void;
	onTrade: () => void;
	buttonState: {
		text: string;
		disabled: boolean;
		onClick: () => void;
		isSweepingBook?: boolean;
		availableShares?: number;
	};
	approvalState: ApprovalState;
	executionGateBanner?: ReactNode;
	calculateContractsForMarketOrder: (usdAmount: number, position: "yes" | "no", side: "buy" | "sell") => MarketOrderCalculation;
	getEffectivePrice: (usdAmount: number, contracts: number, remainingUsd: number) => number;
}

export default function PredictionMarketTradeBoxResponsiveContainer({
	market,
	orderbook,
	state,
	onPositionChange,
	onAmountChange,
	onPriceChange,
	onOrderTypeChange,
	onTradingVenueChange,
	polymarketVenueHint,
	predictVenueHint,
	predictVenueBookHints,
	dflowVenueHint,
	onSideChange,
	onTrade,
	buttonState,
	approvalState,
	executionGateBanner,
	calculateContractsForMarketOrder,
	getEffectivePrice,
}: PredictionMarketTradeBoxResponsiveContainerProps) {
	const isMobile = useMedia("(max-width: 1100px)");
	const isCurtainOpen = useIsCurtainOpen();
	const { openCurtain, closeCurtain } = useCurtainActions();

	const calcCents = useCallback((value?: number | null): string => {
		if (value === undefined || value === null || !isFinite(value))
			return "--";
		return Math.round(value * 100).toString();
	}, []);

	const bestAsk = useMemo(() => {
		if (!orderbook?.asks || orderbook.asks.length === 0) return null;
		return Math.min(...orderbook.asks.map((a: any) => a.price));
	}, [orderbook]);

	const bestBid = useMemo(() => {
		if (!orderbook?.bids || orderbook.bids.length === 0) return null;
		return Math.max(...orderbook.bids.map((b: any) => b.price));
	}, [orderbook]);

	// For polymarket/dflow, the effective orderbook is the selected outcome's native
	// book.  When "no" is selected, swap the display formulas so the NO button shows
	// the book directly while YES shows the 1−p complement.
	const bookRepresentsNo =
		(state.tradingVenue === "polymarket" || state.tradingVenue === "dflow") &&
		state.selectedPosition === "no";

	const yesPriceCents = useMemo(() => {
		if (state.tradingVenue === "predictfun" && predictVenueBookHints?.yes) {
			const h = predictVenueBookHints.yes;
			const ba =
				h.asks && h.asks.length > 0
					? Math.min(...h.asks.map((a: { price: number }) => a.price))
					: null;
			const bb =
				h.bids && h.bids.length > 0
					? Math.max(...h.bids.map((b: { price: number }) => b.price))
					: null;
			return state.side === "buy" ? calcCents(ba) : calcCents(bb);
		}
		if (bookRepresentsNo) {
			return state.side === "buy"
				? calcCents(bestBid === null ? null : 1 - (bestBid as any))
				: calcCents(bestAsk === null ? null : 1 - (bestAsk as any));
		}
		return state.side === "buy"
			? calcCents(bestAsk as any)
			: calcCents(bestBid as any);
	}, [
		state.tradingVenue,
		state.side,
		state.selectedPosition,
		predictVenueBookHints,
		bestAsk,
		bestBid,
		calcCents,
		bookRepresentsNo,
	]);

	const noPriceCents = useMemo(() => {
		if (state.tradingVenue === "predictfun" && predictVenueBookHints?.no) {
			const h = predictVenueBookHints.no;
			const ba =
				h.asks && h.asks.length > 0
					? Math.min(...h.asks.map((a: { price: number }) => a.price))
					: null;
			const bb =
				h.bids && h.bids.length > 0
					? Math.max(...h.bids.map((b: { price: number }) => b.price))
					: null;
			return state.side === "buy" ? calcCents(ba) : calcCents(bb);
		}
		if (bookRepresentsNo) {
			return state.side === "buy"
				? calcCents(bestAsk as any)
				: calcCents(bestBid as any);
		}
		return state.side === "buy"
			? calcCents(bestBid === null ? null : 1 - (bestBid as any))
			: calcCents(bestAsk === null ? null : 1 - (bestAsk as any));
	}, [
		state.tradingVenue,
		state.side,
		state.selectedPosition,
		predictVenueBookHints,
		bestBid,
		bestAsk,
		calcCents,
		bookRepresentsNo,
	]);

	// Dynamic color logic for single VS markets
	const isVsSingle = useMemo(() => {
		const title = (
			market?.displayName ||
			(market as any)?.question ||
			""
		).trim();
		const parts = title
			.split(/\s*vs\.?\s*/i)
			.map((s: string) => s.trim())
			.filter(Boolean);
		return (
			parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1
		);
	}, [market]);

	const yesTeamColor: string = (market as any)?.yesColor || "#22c55e";
	const noTeamColor: string = (market as any)?.noColor || "#ef4444";

	// Check if this is an "Over {number}" market (daily player count style)
	const overUnderMatch = useMemo(() => {
		const title = (
			market?.displayName ||
			(market as any)?.question ||
			""
		).trim();
		// Match "Over" followed by a number (with optional commas)
		const match = title.match(/^Over\s+([\d,]+)/i);
		if (match) {
			return match[1]; // Return the number part
		}
		return null;
	}, [market?.displayName, (market as any)?.question]);

	const { yesTeamLabel: mobileYesLabel, noTeamLabel: mobileNoLabel } =
		useMemo(() => {
			// If it's an Over/Under market, use Over/Under labels
			if (overUnderMatch) {
				return { yesTeamLabel: "Over", noTeamLabel: "Under" };
			}
			
			const title = (
				market?.displayName ||
				(market as any)?.question ||
				""
			).trim();
			if (!title) return { yesTeamLabel: "Yes", noTeamLabel: "No" };
			const parts = title
				.split(/\s*vs\.?\s*/i)
				.map((s: string) => s.trim())
				.filter(Boolean);
			if (
				parts.length === 2 &&
				(market as any)?.umbrellaChildrenCount === 1
			) {
				return { yesTeamLabel: parts[0], noTeamLabel: parts[1] };
			}
			return { yesTeamLabel: "Yes", noTeamLabel: "No" };
		}, [
			market?.displayName,
			(market as any)?.question,
			(market as any)?.umbrellaChildrenCount,
			overUnderMatch,
		]);

	const hexToRgba = (hex?: string, alpha: number = 0.35): string => {
		if (!hex) return `rgba(0,0,0,${alpha})`;
		const cleaned = hex.replace("#", "");
		const full =
			cleaned.length === 3
				? cleaned
						.split("")
						.map((c) => c + c)
						.join("")
				: cleaned;
		const r = parseInt(full.substring(0, 2), 16) || 0;
		const g = parseInt(full.substring(2, 4), 16) || 0;
		const b = parseInt(full.substring(4, 6), 16) || 0;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	};

	const openWithPosition = useCallback(
		(position: "yes" | "no") => {
			onPositionChange(position);
			openCurtain();
		},
		[onPositionChange, openCurtain]
	);

	if (!isMobile) {
		return (
			<div
				className="text-body-medium flex flex-col rounded-12 shadow-[0_2px_8px_rgba(0,0,0,0.3)] p-15"
				style={{ backgroundColor: "black", marginBottom: "80px" }}
				data-qa="prediction-tradebox"
			>
				{executionGateBanner}
			<PredictionMarketTradeBoxUI
				market={market}
				orderbook={orderbook}
				state={state}
				onPositionChange={onPositionChange}
				onAmountChange={onAmountChange}
				onPriceChange={onPriceChange}
				onTradingVenueChange={onTradingVenueChange}
				onOrderTypeChange={onOrderTypeChange}
				onSideChange={onSideChange}
				polymarketVenueHint={polymarketVenueHint}
				predictVenueHint={predictVenueHint}
				predictVenueBookHints={predictVenueBookHints}
				dflowVenueHint={dflowVenueHint}
				onTrade={onTrade}
				buttonState={buttonState}
				approvalState={approvalState}
				calculateContractsForMarketOrder={calculateContractsForMarketOrder}
				getEffectivePrice={getEffectivePrice}
			/>
		</div>
	);
}

	return (
		<PredictionCurtain
			header={
				isCurtainOpen ? null : (
					<div className="prediction-curtain-header">
						<div className="curtain-header-buttons flex gap-8">
							<Button
								variant="secondary"
								onClick={() => openWithPosition("yes")}
								className={`position-btn selected primary`}
								style={{
									flex: 1,
									padding: 12,
									borderRadius: 8,
									fontSize: 18,
									fontWeight: 600,
									minHeight: 48,
									background: isVsSingle
										? yesTeamColor
										: "rgba(34, 197, 94, 0.1)",
									color: isVsSingle ? "#ffffff" : "#22c55e",
									border: `2px solid ${
										isVsSingle ? yesTeamColor : "#22c55e"
									}`,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										isVsSingle
											? yesTeamColor
											: "rgba(34, 197, 94, 0.2)";
									e.currentTarget.style.transform =
										"translateY(-1px)";
									e.currentTarget.style.boxShadow = isVsSingle
										? `0 4px 8px ${hexToRgba(
												yesTeamColor,
												0.45
										  )}`
										: "0 4px 8px rgba(34, 197, 94, 0.3)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background =
										isVsSingle
											? yesTeamColor
											: "rgba(34, 197, 94, 0.1)";
									e.currentTarget.style.transform =
										"translateY(0)";
									e.currentTarget.style.boxShadow = "none";
								}}
							>
								{`${mobileYesLabel} ${yesPriceCents}¢`}
							</Button>
							<Button
								variant="secondary"
								onClick={() => openWithPosition("no")}
								className={`position-btn selected secondary`}
								style={{
									flex: 1,
									padding: 12,
									borderRadius: 8,
									fontSize: 18,
									fontWeight: 600,
									minHeight: 48,
									background: isVsSingle
										? noTeamColor
										: "rgba(239, 68, 68, 0.1)",
									color: isVsSingle ? "#ffffff" : "#ef4444",
									border: `2px solid ${
										isVsSingle ? noTeamColor : "#ef4444"
									}`,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										isVsSingle
											? noTeamColor
											: "rgba(239, 68, 68, 0.2)";
									e.currentTarget.style.transform =
										"translateY(-1px)";
									e.currentTarget.style.boxShadow = isVsSingle
										? `0 4px 8px ${hexToRgba(
												noTeamColor,
												0.45
										  )}`
										: "0 4px 8px rgba(239, 68, 68, 0.3)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background =
										isVsSingle
											? noTeamColor
											: "rgba(239, 68, 68, 0.1)";
									e.currentTarget.style.transform =
										"translateY(0)";
									e.currentTarget.style.boxShadow = "none";
								}}
							>
								{`${mobileNoLabel} ${noPriceCents}¢`}
							</Button>
						</div>
					</div>
				)
			}
			dataQa="prediction-tradebox"
		>
			<div className="curtain-content-inner">
				<div className="curtain-drag-handle"></div>
				{executionGateBanner}
				<button
					className="curtain-close-btn"
					aria-label="Close trading panel"
					onClick={closeCurtain}
				>
					▾
				</button>
			<PredictionMarketTradeBoxUI
				market={market}
				orderbook={orderbook}
				state={state}
				onPositionChange={onPositionChange}
				onAmountChange={onAmountChange}
				onPriceChange={onPriceChange}
				onTradingVenueChange={onTradingVenueChange}
				onOrderTypeChange={onOrderTypeChange}
				onSideChange={onSideChange}
				polymarketVenueHint={polymarketVenueHint}
				predictVenueHint={predictVenueHint}
				predictVenueBookHints={predictVenueBookHints}
				dflowVenueHint={dflowVenueHint}
				onTrade={onTrade}
				buttonState={buttonState}
				approvalState={approvalState}
				calculateContractsForMarketOrder={calculateContractsForMarketOrder}
				getEffectivePrice={getEffectivePrice}
			/>
		</div>
	</PredictionCurtain>
	);
}
