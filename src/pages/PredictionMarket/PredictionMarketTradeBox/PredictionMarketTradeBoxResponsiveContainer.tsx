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
import type { RoutePlan, RouteExecution } from "@/trading/sor";
import Button from "components/Button/Button";
import { getYesNoTeamLabels } from "./teamLabels";
import {
	hexToRgba,
	getContrastingTextColor,
} from "@/helpers/predictionUtils";

export interface StableButtonPrices {
	yesBestAsk: number | null; yesBestBid: number | null;
	noBestAsk: number | null; noBestBid: number | null;
}

interface PredictionMarketTradeBoxResponsiveContainerProps
	extends TradeBoxProps {
	state: TradeBoxState;
	stableButtonPrices?: StableButtonPrices | null;
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
	matchedVenues?: Set<string>;
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
	walletAddress?: string;
	usdcBalance?: number;
	calculateContractsForMarketOrder: (usdAmount: number, position: "yes" | "no", side: "buy" | "sell") => MarketOrderCalculation;
	getEffectivePrice: (usdAmount: number, contracts: number, remainingUsd: number) => number;
	sorRoute: { route: RoutePlan | null; isLoading: boolean; error: string | null; isStale: boolean };
	sorExecution: {
		execution: RouteExecution | null;
		isExecuting: boolean;
		remainingBudget: number | null;
		requestReroute: () => Promise<number | null>;
		acceptResult: () => Promise<void>;
	};
	sorRouteExpired: boolean;
	handleSorExecute: () => void;
	crossBuyYes: number | null;
	crossBuyNo: number | null;
}

export default function PredictionMarketTradeBoxResponsiveContainer({
	market,
	orderbook,
	pandascoreMatchId,
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
	matchedVenues,
	onSideChange,
	onTrade,
	buttonState,
	approvalState,
	executionGateBanner,
	walletAddress,
	usdcBalance,
	calculateContractsForMarketOrder,
	getEffectivePrice,
	sorRoute,
	sorExecution,
	sorRouteExpired,
	handleSorExecute,
	umbrellaDisplayName,
	crossBuyYes,
	crossBuyNo,
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
		if (
			state.tradingVenue === "all" &&
			state.side === "buy" &&
			crossBuyYes != null &&
			Number.isFinite(crossBuyYes)
		) {
			return calcCents(crossBuyYes);
		}
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
		crossBuyYes,
	]);

	const noPriceCents = useMemo(() => {
		if (
			state.tradingVenue === "all" &&
			state.side === "buy" &&
			crossBuyNo != null &&
			Number.isFinite(crossBuyNo)
		) {
			return calcCents(crossBuyNo);
		}
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
		crossBuyNo,
	]);

	const isVsSingle = useMemo(() => {
		if (!market || (market as any)?.umbrellaChildrenCount !== 1) return false;
		const mt = (
			market?.displayName ||
			(market as any)?.question ||
			""
		).trim();
		if (mt.match(/^Over\s+/i)) return false;
		const raw =
			(umbrellaDisplayName || "")
				.replace(/\s*-\s*Match Winner$/i, "")
				.trim() || mt;
		const parts = raw
			.split(/\s*vs\.?\s*/i)
			.map((s: string) => s.trim())
			.filter(Boolean);
		return parts.length === 2;
	}, [market, umbrellaDisplayName]);

	const yesTeamColor: string = (market as any)?.yesColor || "#22c55e";
	const noTeamColor: string = (market as any)?.noColor || "#ef4444";

	const yesCurtainTextSolid = useMemo(
		() => getContrastingTextColor(yesTeamColor),
		[yesTeamColor],
	);
	const noCurtainTextSolid = useMemo(
		() => getContrastingTextColor(noTeamColor),
		[noTeamColor],
	);

	const { yesTeamLabel: mobileYesLabel, noTeamLabel: mobileNoLabel } =
		useMemo(
			() => getYesNoTeamLabels(market, umbrellaDisplayName),
			[market, umbrellaDisplayName],
		);

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
				pandascoreMatchId={pandascoreMatchId}
				umbrellaDisplayName={umbrellaDisplayName}
				crossBuyYes={crossBuyYes}
				crossBuyNo={crossBuyNo}
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
				matchedVenues={matchedVenues}
				onTrade={onTrade}
				buttonState={buttonState}
				approvalState={approvalState}
				walletAddress={walletAddress}
				usdcBalance={usdcBalance}
				calculateContractsForMarketOrder={calculateContractsForMarketOrder}
				getEffectivePrice={getEffectivePrice}
				sorRoute={sorRoute}
				sorExecution={sorExecution}
				sorRouteExpired={sorRouteExpired}
				handleSorExecute={handleSorExecute}
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
									color: isVsSingle
										? yesCurtainTextSolid
										: "#22c55e",
									border: `2px solid ${
										isVsSingle ? yesTeamColor : "#22c55e"
									}`,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										isVsSingle
											? yesTeamColor
											: "rgba(34, 197, 94, 0.2)";
									if (isVsSingle) {
										e.currentTarget.style.color =
											yesCurtainTextSolid;
									}
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
									if (isVsSingle) {
										e.currentTarget.style.color =
											yesCurtainTextSolid;
									}
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
									color: isVsSingle
										? noCurtainTextSolid
										: "#ef4444",
									border: `2px solid ${
										isVsSingle ? noTeamColor : "#ef4444"
									}`,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background =
										isVsSingle
											? noTeamColor
											: "rgba(239, 68, 68, 0.2)";
									if (isVsSingle) {
										e.currentTarget.style.color =
											noCurtainTextSolid;
									}
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
									if (isVsSingle) {
										e.currentTarget.style.color =
											noCurtainTextSolid;
									}
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
				pandascoreMatchId={pandascoreMatchId}
				umbrellaDisplayName={umbrellaDisplayName}
				crossBuyYes={crossBuyYes}
				crossBuyNo={crossBuyNo}
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
				matchedVenues={matchedVenues}
				onTrade={onTrade}
				buttonState={buttonState}
				approvalState={approvalState}
				walletAddress={walletAddress}
				usdcBalance={usdcBalance}
				calculateContractsForMarketOrder={calculateContractsForMarketOrder}
				getEffectivePrice={getEffectivePrice}
				sorRoute={sorRoute}
				sorExecution={sorExecution}
				sorRouteExpired={sorRouteExpired}
				handleSorExecute={handleSorExecute}
			/>
		</div>
	</PredictionCurtain>
	);
}
