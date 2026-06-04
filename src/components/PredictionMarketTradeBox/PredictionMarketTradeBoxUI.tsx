import { useMemo, useEffect } from "react";

import Button from "components/Button/Button";
import type { PredictionMarketTradeBoxUIProps } from "@/features/trading/trade-box/types";
import "./scss/PredictionMarketTradeBox.scss";
import { MyPositionsRow } from "./MyPositionsRow";
import { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import { usePostTradeAccountSyncPending } from "@/features/trading/sor/post-trade/usePostTradeAccountSync";
import { useTradeBoxMarketAvgCents } from "@/features/trading/trade-box/hooks/useTradeBoxMarketAvgCents";
import {
	useTradeBoxSellInputRules,
	useTradeBoxVenueTabGuard,
} from "@/features/trading/trade-box/hooks/useTradeBoxVenueTabGuard";
import SmartRoutingSection from "./SmartRoutingSection";
import TradeBoxExecutionFooter from "./components/TradeBoxExecutionFooter";
import TradeBoxOutcomeButtons from "./components/TradeBoxOutcomeButtons";
import TradeBoxAmountInput from "./components/TradeBoxAmountInput";
import TradeBoxAllMarketsRouteError from "./components/TradeBoxAllMarketsRouteError";
import OddsFormatMenu from "@/components/OddsFormatMenu/OddsFormatMenu";
import { usePortfolio } from "@/context/PortfolioContext";
import { positionToSorOutcome, type SorVenue } from "@/features/trading/sor";

export default function PredictionMarketTradeBoxUI({
	market,
	pandascoreMatchId,
	umbrellaId,
	runtime,
	sorUi,
	team,
	outcomePrices,
}: PredictionMarketTradeBoxUIProps) {
	const {
		state,
		tradeQuote,
		onPositionChange,
		onAmountChange,
		onTradingVenueChange,
		onSideChange,
		buttonState,
		calculateContractsForMarketOrder,
		getEffectivePrice,
		maxScopedSellShares,
		sharesLoadingForActiveTab = false,
		shareBalances,
		dflowUninitAtSubmit = false,
		predictFunFeeRateBps,
	} = runtime;
	const {
		sorRoute,
		sorExecution,
		routePreviewAllowed,
		smartRoutingMarketKey,
		matchedVenues,
		matchedMonitor,
	} = sorUi;

	const { selectedPosition, amount, price, orderType, side, orderResult, tradingVenue } = state;
	const { calculatedContracts } = tradeQuote.preview;
	const outcomeSelection = selectedPosition ?? "yes";

	useEffect(() => {
		if (selectedPosition != null) return;
		onPositionChange("yes");
	}, [selectedPosition, onPositionChange]);

	const setupActivation = useSetupActivationOptional();
	const globalSetupInProgress = Boolean(
		setupActivation?.anyInProgress || setupActivation?.onboardingActive,
	);

	const { cashBalance } = usePortfolio();
	const formattedCashBalance =
		typeof cashBalance === "number" && Number.isFinite(cashBalance)
			? new Intl.NumberFormat("en-US", {
					minimumFractionDigits: 0,
					maximumFractionDigits: 2,
				}).format(cashBalance)
			: null;

	const syncUiKey =
		String(
			(market as { _id?: string })?._id ?? (market as { questionId?: string })?.questionId ?? "",
		).trim() || null;
	const positionSharesChainSyncUi = usePostTradeAccountSyncPending(syncUiKey);

	const sellFieldsLocked =
		side === "sell" && maxScopedSellShares <= 0 && !sharesLoadingForActiveTab;
	const tradeInteractionLocked = sorExecution.isExecuting || state.isLoading;

	useTradeBoxVenueTabGuard({
		pandascoreMatchId,
		matchedVenues,
		tradingVenue,
		tradeInteractionLocked,
		onTradingVenueChange,
	});

	const { shareAmountRequiresWholeContracts, amountInputShowsDollarPrefix } =
		useTradeBoxSellInputRules({
			tradingVenue,
			side,
			matchedVenues,
			shareBalances,
		});

	const userSellSharesByVenue = useMemo((): Partial<Record<SorVenue, number>> => {
		const o: Partial<Record<SorVenue, number>> = {};
		for (const row of shareBalances.sellVenueBreakdown) {
			o[row.key as SorVenue] = row.shares;
		}
		return o;
	}, [shareBalances.sellVenueBreakdown]);

	const { oddsData, sellAvgCents } = useTradeBoxMarketAvgCents({
		tradingVenue,
		orderType,
		side,
		amount,
		selectedPosition,
		bestAsk: outcomePrices.bestAsk,
		bestBid: outcomePrices.bestBid,
		predictHints: outcomePrices.predictHints,
		yesHintPrices: outcomePrices.yesHintPrices,
		noHintPrices: outcomePrices.noHintPrices,
		sorRoute,
		calculateContractsForMarketOrder,
		getEffectivePrice,
	});

	return (
		<div className="prediction-market-tradebox">
			<div className="market-name-header">
				{team.matchTitle ? (
					<div className="market-name-header__stack">
						<span className="market-name-header__match">{team.matchTitle}</span>
						<h3 className="market-name-header__title market-name-header__title--outcome">
							{team.displayMarketTitle}
						</h3>
					</div>
				) : (
					<h3 className="market-name-header__title">{team.displayMarketTitle}</h3>
				)}
			</div>

			<div className="tradebox-header">
				<div className="side-selector">
					<Button
						qa="tradebox-side-buy"
						variant={side === "buy" ? "primary" : "secondary"}
						disabled={tradeInteractionLocked}
						onClick={() => onSideChange("buy")}
						className={`side-btn ${side === "buy" ? "selected primary" : ""}`}
					>
						Buy
					</Button>

					<Button
						qa="tradebox-side-sell"
						variant={side === "sell" ? "primary" : "secondary"}
						disabled={tradeInteractionLocked}
						onClick={() => onSideChange("sell")}
						className={`side-btn ${side === "sell" ? "selected secondary" : ""}`}
					>
						Sell
					</Button>
				</div>
				<OddsFormatMenu iconSize={20} />
			</div>

			<div className="tradebox-separator" />

			<TradeBoxOutcomeButtons
				outcomeSelection={outcomeSelection}
				yesTeamLabel={team.yesTeamLabel}
				noTeamLabel={team.noTeamLabel}
				yesPriceCents={outcomePrices.yesPriceCents}
				noPriceCents={outcomePrices.noPriceCents}
				isVsSingle={team.isVsSingle}
				yesTeamColor={team.yesTeamColor}
				noTeamColor={team.noTeamColor}
				yesTeamTextSolid={team.yesTeamTextSolid}
				yesTeamTextTint={team.yesTeamTextTint}
				noTeamTextSolid={team.noTeamTextSolid}
				noTeamTextTint={team.noTeamTextTint}
				tradeInteractionLocked={tradeInteractionLocked}
				onPositionChange={onPositionChange}
			/>

			<div style={{ marginTop: 24 }}>
				<MyPositionsRow
					market={market as Parameters<typeof MyPositionsRow>[0]["market"]}
					umbrellaId={umbrellaId}
					tradingVenue={tradingVenue}
					yesTeamLabel={team.yesTeamLabel}
					noTeamLabel={team.noTeamLabel}
					isVsSingle={team.isVsSingle}
					yesTeamColor={team.yesTeamColor}
					noTeamColor={team.noTeamColor}
					side={side}
					selectedPosition={selectedPosition}
					matchedMonitor={matchedMonitor}
					shareBalances={shareBalances}
					positionSharesRefreshing={positionSharesChainSyncUi}
				/>
			</div>

			<>
				<TradeBoxAmountInput
					market={market}
					side={side}
					orderType={orderType}
					selectedPosition={selectedPosition}
					amount={amount}
					amountInputShowsDollarPrefix={amountInputShowsDollarPrefix}
					shareAmountRequiresWholeContracts={shareAmountRequiresWholeContracts}
					sellFieldsLocked={sellFieldsLocked}
					tradeInteractionLocked={tradeInteractionLocked}
					maxScopedSellShares={maxScopedSellShares}
					onAmountChange={onAmountChange}
				/>

				{formattedCashBalance !== null && (
					<div className="trade-cash-balance-hint">Balance: ${formattedCashBalance}</div>
				)}

				<SmartRoutingSection
					displayRoute={sorRoute.displayRoute}
					executionRoute={sorRoute.executionRoute}
					venuePreviews={sorRoute.venuePreviews ?? null}
					tradingVenue={tradingVenue}
					isLoading={sorRoute.displayLoading}
					onSelectVenue={onTradingVenueChange}
					userAmount={amount}
					side={side}
					routePreviewAllowed={routePreviewAllowed}
					smartRoutingMarketKey={smartRoutingMarketKey}
					sorDisplayRouteSourceQuestionId={sorRoute.displayRouteSourceQuestionId}
					sorExecutionRouteSourceQuestionId={sorRoute.executionRouteSourceQuestionId}
					selectedOutcome={positionToSorOutcome(outcomeSelection)}
					predictFunFeeRateBps={predictFunFeeRateBps}
					executionLoading={sorRoute.executionLoading}
					userSellSharesByVenue={userSellSharesByVenue}
					venueSelectionLocked={tradeInteractionLocked}
					orderType={orderType}
				/>

				{tradingVenue === "all" && (
					<TradeBoxAllMarketsRouteError
						displayError={sorRoute.displayError}
						displayErrorCode={sorRoute.displayErrorCode}
						displayRoute={sorRoute.displayRoute}
						displayLoading={sorRoute.displayLoading}
						globalSetupInProgress={globalSetupInProgress}
					/>
				)}
			</>

			<TradeBoxExecutionFooter
				tradingVenue={tradingVenue}
				sorRoute={sorRoute}
				side={side}
				buttonState={buttonState}
				maxScopedSellShares={maxScopedSellShares}
				amount={amount}
				outcomeSelection={outcomeSelection}
				yesTeamLabel={team.yesTeamLabel}
				noTeamLabel={team.noTeamLabel}
				market={market}
				state={state}
				orderType={orderType}
				selectedPosition={selectedPosition}
				price={price}
				oddsData={oddsData}
				sellAvgCents={sellAvgCents}
				calculatedContracts={calculatedContracts}
				tradeQuote={tradeQuote}
				sorExecution={sorExecution}
				dflowUninitAtSubmit={dflowUninitAtSubmit}
				orderResult={orderResult}
			/>
		</div>
	);
}
