import { useCallback } from "react";
import { useMedia } from "react-use";
import PredictionMarketTradeBoxUI from "./PredictionMarketTradeBoxUI";
import {
	PredictionCurtain,
	useIsCurtainOpen,
	useCurtainActions,
} from "./PredictionCurtain";
import type { ReactNode } from "react";
import type { PredictionMarketTradeBoxUIProps } from "./types";
import Button from "components/Button/Button";
import { hexToRgba, getContrastingTextColor } from "@/helpers/predictionUtils";
import { useTradeBoxOutcomePrices } from "./hooks/useTradeBoxOutcomePrices";
import { useTradeBoxTeamPresentation } from "./hooks/useTradeBoxTeamPresentation";

interface PredictionMarketTradeBoxResponsiveContainerProps
	extends PredictionMarketTradeBoxUIProps {
	executionGateBanner?: ReactNode;
}

export default function PredictionMarketTradeBoxResponsiveContainer({
	market,
	orderbook,
	pandascoreMatchId,
	state,
	tradeQuote,
	onPositionChange,
	onAmountChange,
	onTradingVenueChange,
	predictVenueBookHints,
	levelUpVenueBookHints,
	matchedVenues,
	onSideChange,
	buttonState,
	executionGateBanner,
	calculateContractsForMarketOrder,
	getEffectivePrice,
	sorRoute,
	sorExecution,
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
}: PredictionMarketTradeBoxResponsiveContainerProps) {
	const isMobile = useMedia("(max-width: 1100px)");
	const isCurtainOpen = useIsCurtainOpen();
	const { openCurtain } = useCurtainActions();

	const team = useTradeBoxTeamPresentation(market, umbrellaDisplayName);

	const outcomePrices = useTradeBoxOutcomePrices({
		tradingVenue: state.tradingVenue,
		side: state.side,
		selectedPosition: state.selectedPosition,
		orderbook,
		predictVenueBookHints,
		levelUpVenueBookHints,
		matchedMonitor,
		yesTeamLabel: team.yesTeamLabel,
		noTeamLabel: team.noTeamLabel,
		crossBuyYes,
		crossBuyNo,
		allMarketsSellYesBid,
		allMarketsSellNoBid,
	});

	const yesCurtainTextSolid = getContrastingTextColor(team.yesTeamColor);
	const noCurtainTextSolid = getContrastingTextColor(team.noTeamColor);

	const openWithPosition = useCallback(
		(position: "yes" | "no") => {
			onPositionChange(position);
			openCurtain();
		},
		[onPositionChange, openCurtain],
	);

	const tradeBoxUiProps: PredictionMarketTradeBoxUIProps = {
		market,
		orderbook,
		pandascoreMatchId,
		umbrellaId,
		umbrellaDisplayName,
		crossBuyYes,
		crossBuyNo,
		state,
		tradeQuote,
		onPositionChange,
		onAmountChange,
		onTradingVenueChange,
		onSideChange,
		predictVenueBookHints,
		levelUpVenueBookHints,
		matchedVenues,
		buttonState,
		calculateContractsForMarketOrder,
		getEffectivePrice,
		sorRoute,
		sorExecution,
		maxScopedSellShares,
		sharesLoadingForActiveTab,
		matchedMonitor,
		allMarketsSellYesBid,
		allMarketsSellNoBid,
		shareBalances,
		dflowUninitAtSubmit,
		routePreviewAllowed,
		smartRoutingMarketKey,
		predictFunFeeRateBps,
	};

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
					<PredictionMarketTradeBoxUI {...tradeBoxUiProps} />
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
								className="position-btn selected primary"
								style={{
									flex: 1,
									padding: 12,
									borderRadius: 8,
									fontSize: 18,
									fontWeight: 600,
									minHeight: 48,
									background: team.isVsSingle
										? team.yesTeamColor
										: "rgba(34, 197, 94, 0.1)",
									color: team.isVsSingle ? yesCurtainTextSolid : "#22c55e",
									border: `2px solid ${
										team.isVsSingle ? team.yesTeamColor : "#22c55e"
									}`,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = team.isVsSingle
										? team.yesTeamColor
										: "rgba(34, 197, 94, 0.2)";
									if (team.isVsSingle) {
										e.currentTarget.style.color = yesCurtainTextSolid;
									}
									e.currentTarget.style.transform = "translateY(-1px)";
									e.currentTarget.style.boxShadow = team.isVsSingle
										? `0 4px 8px ${hexToRgba(team.yesTeamColor, 0.45)}`
										: "0 4px 8px rgba(34, 197, 94, 0.3)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = team.isVsSingle
										? team.yesTeamColor
										: "rgba(34, 197, 94, 0.1)";
									if (team.isVsSingle) {
										e.currentTarget.style.color = yesCurtainTextSolid;
									}
									e.currentTarget.style.transform = "translateY(0)";
									e.currentTarget.style.boxShadow = "none";
								}}
							>
								<strong className="position-btn__label-row">
									<span className="position-btn__name">{team.yesTeamLabel}</span>
									<span className="position-btn__price">
										{outcomePrices.formatCurtainPrice(
											outcomePrices.yesPriceCurtain,
										)}
									</span>
								</strong>
							</Button>
							<Button
								variant="secondary"
								onClick={() => openWithPosition("no")}
								className="position-btn selected secondary"
								style={{
									flex: 1,
									padding: 12,
									borderRadius: 8,
									fontSize: 18,
									fontWeight: 600,
									minHeight: 48,
									background: team.isVsSingle
										? team.noTeamColor
										: "rgba(239, 68, 68, 0.1)",
									color: team.isVsSingle ? noCurtainTextSolid : "#ef4444",
									border: `2px solid ${
										team.isVsSingle ? team.noTeamColor : "#ef4444"
									}`,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = team.isVsSingle
										? team.noTeamColor
										: "rgba(239, 68, 68, 0.2)";
									if (team.isVsSingle) {
										e.currentTarget.style.color = noCurtainTextSolid;
									}
									e.currentTarget.style.transform = "translateY(-1px)";
									e.currentTarget.style.boxShadow = team.isVsSingle
										? `0 4px 8px ${hexToRgba(team.noTeamColor, 0.45)}`
										: "0 4px 8px rgba(239, 68, 68, 0.3)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = team.isVsSingle
										? team.noTeamColor
										: "rgba(239, 68, 68, 0.1)";
									if (team.isVsSingle) {
										e.currentTarget.style.color = noCurtainTextSolid;
									}
									e.currentTarget.style.transform = "translateY(0)";
									e.currentTarget.style.boxShadow = "none";
								}}
							>
								<strong className="position-btn__label-row">
									<span className="position-btn__name">{team.noTeamLabel}</span>
									<span className="position-btn__price">
										{outcomePrices.formatCurtainPrice(
											outcomePrices.noPriceCurtain,
										)}
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
				<PredictionMarketTradeBoxUI {...tradeBoxUiProps} />
			</div>
		</PredictionCurtain>
	);
}
