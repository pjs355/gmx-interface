import { useCallback } from "react";
import { useMedia } from "react-use";
import PredictionMarketTradeBoxUI from "./PredictionMarketTradeBoxUI";
import { PredictionCurtain, useIsCurtainOpen, useCurtainActions } from "./PredictionCurtain";
import type { PredictionMarketTradeBoxResponsiveContainerProps } from "@/features/trading/trade-box/types";
import Button from "components/Button/Button";
import { hexToRgba, getContrastingTextColor } from "@/features/markets/presentation/teamColors";
import { useTradeBoxOutcomePrices } from "@/features/trading/trade-box/hooks/useTradeBoxOutcomePrices";
import { useTradeBoxTeamPresentation } from "@/features/trading/trade-box/hooks/useTradeBoxTeamPresentation";
import { usePredictionData } from "@/context/PredictionDataContext";

export default function PredictionMarketTradeBoxResponsiveContainer({
	market,
	orderbook,
	pandascoreMatchId,
	umbrellaId,
	umbrellaDisplayName,
	umbrellaTeamMappings,
	selectionTitleOverride,
	crossBuyYes,
	crossBuyNo,
	runtime,
	sorUi,
	mobilePeekBar = "default",
	executionGateBanner,
}: PredictionMarketTradeBoxResponsiveContainerProps) {
	const isMobile = useMedia("(max-width: 1100px)");
	const isCurtainOpen = useIsCurtainOpen();
	const { openCurtain } = useCurtainActions();
	const { fifaGameTeamColorBySlug } = usePredictionData();

	const team = useTradeBoxTeamPresentation(
		market,
		umbrellaDisplayName,
		umbrellaTeamMappings,
		fifaGameTeamColorBySlug,
		runtime.state.selectedPosition,
		selectionTitleOverride,
	);

	const outcomePrices = useTradeBoxOutcomePrices({
		tradingVenue: runtime.state.tradingVenue,
		side: runtime.state.side,
		selectedPosition: runtime.state.selectedPosition,
		orderbook,
		predictVenueBookHints: sorUi.predictVenueBookHints,
		levelUpVenueBookHints: sorUi.levelUpVenueBookHints,
		matchedMonitor: sorUi.matchedMonitor,
		moneylineLeg: market?.moneylineLeg ?? sorUi.matchedMonitor?.moneylineLeg ?? null,
		yesTeamLabel: team.yesTeamLabel,
		noTeamLabel: team.noTeamLabel,
		crossBuyYes,
		crossBuyNo,
		allMarketsSellYesBid: sorUi.allMarketsSellYesBid,
		allMarketsSellNoBid: sorUi.allMarketsSellNoBid,
	});

	const yesCurtainTextSolid = getContrastingTextColor(team.yesTeamColor);
	const noCurtainTextSolid = getContrastingTextColor(team.noTeamColor);

	const { onPositionChange } = runtime;

	const openWithPosition = useCallback(
		(position: "yes" | "no") => {
			onPositionChange(position);
			openCurtain();
		},
		[onPositionChange, openCurtain],
	);

	const tradeBoxUiProps = {
		market,
		orderbook,
		pandascoreMatchId,
		umbrellaId,
		umbrellaDisplayName,
		crossBuyYes,
		crossBuyNo,
		team,
		outcomePrices,
		runtime,
		sorUi,
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
									background: team.isVsSingle ? team.yesTeamColor : "rgba(34, 197, 94, 0.1)",
									color: team.isVsSingle ? yesCurtainTextSolid : "#22c55e",
									border: `2px solid ${team.isVsSingle ? team.yesTeamColor : "#22c55e"}`,
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
										{outcomePrices.formatCurtainPrice(outcomePrices.yesPriceCurtain)}
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
									background: team.isVsSingle ? team.noTeamColor : "rgba(239, 68, 68, 0.1)",
									color: team.isVsSingle ? noCurtainTextSolid : "#ef4444",
									border: `2px solid ${team.isVsSingle ? team.noTeamColor : "#ef4444"}`,
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
										{outcomePrices.formatCurtainPrice(outcomePrices.noPriceCurtain)}
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
