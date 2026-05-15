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
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type {
	RoutePlan,
	RouteExecution,
	SorErrorCode,
	SorExecutionPhase,
	SorPrefundLegProgress,
	VenueRoutePreview,
} from "@/trading/sor";
import Button from "components/Button/Button";
import { getYesNoTeamLabels } from "./teamLabels";
import {
	hexToRgba,
	getContrastingTextColor,
} from "@/helpers/predictionUtils";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import {
	dflowKalshiOutcomeDisplayPrices,
	hasDflowKalshiMonitorLink,
} from "@/trading/dflow/monitorDflowBooks";

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
	levelUpVenueBookHints?: {
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
		depositShortfallUsd?: number;
		isSweepingBook?: boolean;
		availableShares?: number;
	};
	approvalState: ApprovalState;
	executionGateBanner?: ReactNode;
	walletAddress?: string;
	usdcBalance?: number;
	calculateContractsForMarketOrder: (usdAmount: number, position: "yes" | "no", side: "buy" | "sell") => MarketOrderCalculation;
	getEffectivePrice: (usdAmount: number, contracts: number, remainingUsd: number) => number;
	sorRoute: {
		displayRoute: RoutePlan | null;
		executionRoute: RoutePlan | null;
		venuePreviews: VenueRoutePreview[] | null;
		displayLoading: boolean;
		displayStale: boolean;
		executionLoading: boolean;
		executionStale: boolean;
		displayError: string | null;
		displayErrorCode: SorErrorCode | null;
		executionError: string | null;
		executionErrorCode: SorErrorCode | null;
	};
	sorExecution: {
		execution: RouteExecution | null;
		isExecuting: boolean;
		executionPhase?: SorExecutionPhase;
		prefundLegProgress?: SorPrefundLegProgress | null;
		remainingBudget: number | null;
		requestReroute: () => Promise<number | null>;
		acceptResult: () => Promise<void>;
		resetExecution: () => void;
	};
	sorRouteExpired: boolean;
	handleSorExecute: () => void;
	crossBuyYes: number | null;
	crossBuyNo: number | null;
	/** Max sellable shares for the active venue tab and selected outcome (SOR-scoped). */
	maxScopedSellShares: number;
	/**
	 * True while the active tab's per-token share-balance query is still in
	 * flight (today: Predict's BSC `balanceOf` and the All-Markets aggregator
	 * that includes it). The UI uses this to keep the sell input UNLOCKED
	 * during the BSC RPC roundtrip — locking it for the ~1-2s fetch window
	 * was making the trade box claim "No shares to sell" before we actually
	 * knew whether the user holds any.
	 */
	sharesLoadingForActiveTab?: boolean;
	allMarketsSellYesBid?: number | null;
	allMarketsSellNoBid?: number | null;
	shareBalances: TradeBoxShareBalancesSnapshot;
	/**
	 * True when the completed DFlow leg's POST submit indicated `initializedMarket`
	 * (init-payer co-sign). Surfaces the "Kalshi via DFlow is creating this market"
	 * notice for the lifetime of the current success `orderResult`.
	 */
	dflowUninitAtSubmit?: boolean;
	routePreviewAllowed: boolean;
	smartRoutingMarketKey: string;
	/** Predict.fun market fee (bps) for net-held share display; omit when unknown. */
	predictFunFeeRateBps?: number;
	/**
	 * Kalshi/DFlow market buy: Pond `/order/quote` contracts for E2E `data-leg-num-shares`
	 * when debounced quote matches typed USD (avoids SOR vs executable drift).
	 */
	dflowOrderQuoteForSentinel?: {
		contracts: number | null;
		amountAlignedWithQuote: boolean;
	};
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
	levelUpVenueBookHints,
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
	umbrellaId,
	umbrellaDisplayName,
	crossBuyYes,
	crossBuyNo,
	maxScopedSellShares,
	sharesLoadingForActiveTab = false,
	matchedMonitor,
	allMarketsSellYesBid = null,
	allMarketsSellNoBid = null,
	shareBalances,
	mobilePeekBar = "default",
	dflowUninitAtSubmit = false,
	routePreviewAllowed,
	smartRoutingMarketKey,
	predictFunFeeRateBps,
	dflowOrderQuoteForSentinel,
}: PredictionMarketTradeBoxResponsiveContainerProps) {
	const isMobile = useMedia("(max-width: 1100px)");
	const isCurtainOpen = useIsCurtainOpen();
	const { openCurtain } = useCurtainActions();
	const { formatPrice } = useOddsDisplay();

	const finiteOrNull = (v: number | null | undefined): number | null =>
		typeof v === "number" && Number.isFinite(v) ? v : null;
	const bestAsk = useMemo(() => {
		if (!orderbook?.asks || orderbook.asks.length === 0) return null;
		return Math.min(...orderbook.asks.map((a: any) => a.price));
	}, [orderbook]);

	const bestBid = useMemo(() => {
		if (!orderbook?.bids || orderbook.bids.length === 0) return null;
		return Math.max(...orderbook.bids.map((b: any) => b.price));
	}, [orderbook]);

	const { yesTeamLabel, noTeamLabel } = useMemo(
		() => getYesNoTeamLabels(market, umbrellaDisplayName),
		[market, umbrellaDisplayName],
	);

	// Polymarket/Limitless: selected outcome book is NO when NO selected — complement
	// swap for peek buttons. Kalshi/DFlow uses separate YES books per outcome (`dflowKalshiOutcomeDisplayPrices`).
	const bookRepresentsNo =
		(state.tradingVenue === "polymarket" ||
			state.tradingVenue === "limitless") &&
		state.selectedPosition === "no";

	const yesPriceCurtain = useMemo((): number | null | "" => {
		if (state.tradingVenue === "all" && state.side === "sell") {
			if (allMarketsSellYesBid != null && Number.isFinite(allMarketsSellYesBid)) {
				return allMarketsSellYesBid;
			}
			return "";
		}
		if (
			state.tradingVenue === "all" &&
			state.side === "buy" &&
			crossBuyYes != null &&
			Number.isFinite(crossBuyYes)
		) {
			return crossBuyYes;
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
			return state.side === "buy" ? finiteOrNull(ba) : finiteOrNull(bb);
		}
		if (state.tradingVenue === "levelup" && levelUpVenueBookHints?.yes) {
			const h = levelUpVenueBookHints.yes;
			const ba =
				h.asks && h.asks.length > 0
					? Math.min(...h.asks.map((a: { price: number }) => a.price))
					: null;
			const bb =
				h.bids && h.bids.length > 0
					? Math.max(...h.bids.map((b: { price: number }) => b.price))
					: null;
			return state.side === "buy" ? finiteOrNull(ba) : finiteOrNull(bb);
		}
		if (
			state.tradingVenue === "dflow" &&
			matchedMonitor &&
			hasDflowKalshiMonitorLink(matchedMonitor)
		) {
			const out = dflowKalshiOutcomeDisplayPrices(
				matchedMonitor,
				yesTeamLabel,
				noTeamLabel,
				state.side,
			);
			return finiteOrNull(out.yes);
		}
		if (bookRepresentsNo) {
			return state.side === "buy"
				? finiteOrNull(bestBid === null ? null : 1 - (bestBid as number))
				: finiteOrNull(bestAsk === null ? null : 1 - (bestAsk as number));
		}
		return state.side === "buy"
			? finiteOrNull(bestAsk as number | null)
			: finiteOrNull(bestBid as number | null);
	}, [
		state.tradingVenue,
		state.side,
		state.selectedPosition,
		predictVenueBookHints,
		levelUpVenueBookHints,
		matchedMonitor,
		yesTeamLabel,
		noTeamLabel,
		bestAsk,
		bestBid,
		bookRepresentsNo,
		crossBuyYes,
		allMarketsSellYesBid,
	]);

	const noPriceCurtain = useMemo((): number | null | "" => {
		if (state.tradingVenue === "all" && state.side === "sell") {
			if (allMarketsSellNoBid != null && Number.isFinite(allMarketsSellNoBid)) {
				return allMarketsSellNoBid;
			}
			return "";
		}
		if (
			state.tradingVenue === "all" &&
			state.side === "buy" &&
			crossBuyNo != null &&
			Number.isFinite(crossBuyNo)
		) {
			return crossBuyNo;
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
			return state.side === "buy" ? finiteOrNull(ba) : finiteOrNull(bb);
		}
		if (state.tradingVenue === "levelup" && levelUpVenueBookHints?.no) {
			const h = levelUpVenueBookHints.no;
			const ba =
				h.asks && h.asks.length > 0
					? Math.min(...h.asks.map((a: { price: number }) => a.price))
					: null;
			const bb =
				h.bids && h.bids.length > 0
					? Math.max(...h.bids.map((b: { price: number }) => b.price))
					: null;
			return state.side === "buy" ? finiteOrNull(ba) : finiteOrNull(bb);
		}
		if (
			state.tradingVenue === "dflow" &&
			matchedMonitor &&
			hasDflowKalshiMonitorLink(matchedMonitor)
		) {
			const out = dflowKalshiOutcomeDisplayPrices(
				matchedMonitor,
				yesTeamLabel,
				noTeamLabel,
				state.side,
			);
			return finiteOrNull(out.no);
		}
		if (bookRepresentsNo) {
			return state.side === "buy"
				? finiteOrNull(bestAsk as number | null)
				: finiteOrNull(bestBid as number | null);
		}
		return state.side === "buy"
			? finiteOrNull(bestBid === null ? null : 1 - (bestBid as number))
			: finiteOrNull(bestAsk === null ? null : 1 - (bestAsk as number));
	}, [
		state.tradingVenue,
		state.side,
		state.selectedPosition,
		predictVenueBookHints,
		levelUpVenueBookHints,
		matchedMonitor,
		yesTeamLabel,
		noTeamLabel,
		bestBid,
		bestAsk,
		bookRepresentsNo,
		crossBuyNo,
		allMarketsSellNoBid,
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
				className="prediction-trade-column-shell text-body-medium flex flex-col"
				data-qa="prediction-tradebox"
				data-qa-umbrella-id={umbrellaId ?? undefined}
			>
				<div className="prediction-trade-column-underlay" aria-hidden />
				<div className="prediction-trade-column-body">
					{executionGateBanner}
					<PredictionMarketTradeBoxUI
						market={market}
						orderbook={orderbook}
						pandascoreMatchId={pandascoreMatchId}
						umbrellaId={umbrellaId}
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
						levelUpVenueBookHints={levelUpVenueBookHints}
						dflowVenueHint={dflowVenueHint}
						matchedVenues={matchedVenues}
						onTrade={onTrade}
						buttonState={buttonState}
						approvalState={approvalState}
						walletAddress={walletAddress}
						usdcBalance={usdcBalance}
						calculateContractsForMarketOrder={
							calculateContractsForMarketOrder
						}
						getEffectivePrice={getEffectivePrice}
						sorRoute={sorRoute}
						sorExecution={sorExecution}
						sorRouteExpired={sorRouteExpired}
						handleSorExecute={handleSorExecute}
						maxScopedSellShares={maxScopedSellShares}
						sharesLoadingForActiveTab={sharesLoadingForActiveTab}
						matchedMonitor={matchedMonitor}
						allMarketsSellYesBid={allMarketsSellYesBid}
						allMarketsSellNoBid={allMarketsSellNoBid}
						shareBalances={shareBalances}
						dflowUninitAtSubmit={dflowUninitAtSubmit}
						routePreviewAllowed={routePreviewAllowed}
						smartRoutingMarketKey={smartRoutingMarketKey}
						predictFunFeeRateBps={predictFunFeeRateBps}
						dflowOrderQuoteForSentinel={dflowOrderQuoteForSentinel}
					/>
				</div>
			</div>
		);
	}

	return (
		<PredictionCurtain
			header={
				mobilePeekBar === "hidden" || isCurtainOpen ? null : (
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
								<strong className="position-btn__label-row">
									<span className="position-btn__name">{yesTeamLabel}</span>
									<span className="position-btn__price">
										{yesPriceCurtain === ""
											? ""
											: formatPrice(yesPriceCurtain)}
									</span>
								</strong>
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
								<strong className="position-btn__label-row">
									<span className="position-btn__name">{noTeamLabel}</span>
									<span className="position-btn__price">
										{noPriceCurtain === ""
											? ""
											: formatPrice(noPriceCurtain)}
									</span>
								</strong>
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
			<PredictionMarketTradeBoxUI
				market={market}
				orderbook={orderbook}
				pandascoreMatchId={pandascoreMatchId}
				umbrellaId={umbrellaId}
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
				levelUpVenueBookHints={levelUpVenueBookHints}
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
				maxScopedSellShares={maxScopedSellShares}
				sharesLoadingForActiveTab={sharesLoadingForActiveTab}
				matchedMonitor={matchedMonitor}
				allMarketsSellYesBid={allMarketsSellYesBid}
				allMarketsSellNoBid={allMarketsSellNoBid}
				shareBalances={shareBalances}
				dflowUninitAtSubmit={dflowUninitAtSubmit}
				routePreviewAllowed={routePreviewAllowed}
				smartRoutingMarketKey={smartRoutingMarketKey}
				predictFunFeeRateBps={predictFunFeeRateBps}
				dflowOrderQuoteForSentinel={dflowOrderQuoteForSentinel}
			/>
			</div>
	</PredictionCurtain>
	);
}
