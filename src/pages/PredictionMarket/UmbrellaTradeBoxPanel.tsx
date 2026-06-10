import React, { useState } from "react";
import { useMedia } from "react-use";
import PredictionMarketTradeBox from "@/components/PredictionMarketTradeBox";
import type { TradingVenue } from "@/components/PredictionMarketTradeBox";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { SettledInfo } from "./useMatchSettled";
import { getMarketId } from "./utils";
import type { TradingPagePrices } from "@/features/markets/pricing/useTradingPagePrices";
import {
	isPerLegVenueKey,
	resolveUmbrellaVenueKey,
} from "@/features/markets/pricing/venueLookupKey";
import { TradeBoxSkeleton } from "./Skeletons";
import { formatUmbrellaTitleForTradingPage } from "@/features/markets/presentation/umbrellaDisplayName";

export type UmbrellaTradeBoxPanelProps = {
	umbrella: Umbrella;
	questionOrderbooks: Record<string, unknown>;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	selectionTitleOverride?: string | null;
	onPositionChange: (p: "yes" | "no") => void;
	settledInfo?: SettledInfo | null;
	tradingPagePrices: TradingPagePrices;
	venueOverride?: TradingVenue;
	mobilePeekBar?: "default" | "hidden";
};

export function UmbrellaTradeBoxPanel({
	umbrella,
	questionOrderbooks,
	activeMarket,
	activePosition,
	selectionTitleOverride,
	onPositionChange,
	settledInfo,
	tradingPagePrices,
	venueOverride,
	mobilePeekBar = "default",
}: UmbrellaTradeBoxPanelProps) {
	const [, setTradeSide] = useState<"buy" | "sell">("buy");
	/* Match desktop market grid (`predictions-page__home-trade-grid` @ 1101px). */
	const wideTradeDock = useMedia("(min-width: 1101px)");
	const compactTradeDock = !wideTradeDock;

	/* Shell is only for states that do not mount `PredictionMarketTradeBox`
	 * (that component’s responsive container already wraps desktop with the shell). */
	const desktopTradeDockShell = (child: React.ReactNode) =>
		wideTradeDock ? (
			<div className="prediction-trade-column-shell" data-qa="prediction-tradebox">
				<div className="prediction-trade-column-underlay" aria-hidden />
				<div className="prediction-trade-column-body">{child}</div>
			</div>
		) : (
			child
		);

	/**
	 * Umbrella-level `pandascore_matchId` for esports series; per-map
	 * `${pandascore_matchId}-map-${slot}` for esports map legs; per-leg
	 * `polymarketMarketId` for FIFA 3-way mirror markets. Drives `multiVenueEnabled`
	 * + cross-venue SOR in `PredictionMarketTradeBox` identically for all of them.
	 */
	const pandascoreMatchId = resolveUmbrellaVenueKey(umbrella, activeMarket);
	const perLeg = isPerLegVenueKey(umbrella, activeMarket);

	// Umbrella-level Limitless / Predict.fun routing applies to the umbrella's
	// series book only. For per-leg keys (FIFA legs or esports map legs) the leg
	// carries its own `exchangeMatching`; passing the umbrella mappings here would
	// route trades to the wrong venue market id. The trade box already handles
	// "no routing on this leg" gracefully (view-only sell strip, no submit).
	const umbrellaLimitless = perLeg ? undefined : umbrella?.exchangeMatching?.limitless;
	const umbrellaPredictFun = perLeg ? undefined : umbrella?.exchangeMatching?.predictFun;

	if (settledInfo) {
		return desktopTradeDockShell(
			<div className="prediction-market-tradebox match-settled-banner">
				<div className="match-settled-banner__content">
					<div className="match-settled-banner__winner">{settledInfo.winnerName} has won!</div>
				</div>
			</div>,
		);
	}

	// Only show the skeleton when we don't have a market at all yet (first paint, no
	// umbrella picked). Once an `activeMarket` exists, render the trade box even if its
	// orderbook hasn't arrived — the trade box already handles a null/empty book
	// gracefully (the Submit button shows "Fetching price…" and inputs stay editable).
	// Desktop (≥1101px): amount/venue can persist across market switches (sticky context).
	// Mobile/tablet: we remount the trade box per market + clear sticky so venue rows reset.
	if (!activeMarket) {
		return desktopTradeDockShell(<TradeBoxSkeleton />);
	}

	const orderbook = questionOrderbooks[getMarketId(activeMarket)] as any;

	const tradeRouteIsolationKey = `${umbrella._id}-${getMarketId(activeMarket)}`;

	return (
		<PredictionMarketTradeBox
			key={compactTradeDock ? tradeRouteIsolationKey : undefined}
			market={
				{
					...(activeMarket as any),
					umbrellaChildrenCount: umbrella?.children?.length || 0,
				} as any
			}
			orderbook={orderbook ?? null}
			pandascoreMatchId={pandascoreMatchId || undefined}
			umbrellaId={umbrella._id}
			limitlessMappingFromUmbrella={umbrellaLimitless}
			predictFunMappingFromUmbrella={umbrellaPredictFun}
			umbrellaDisplayName={formatUmbrellaTitleForTradingPage(umbrella)}
			umbrellaTeamMappings={umbrella.teamMappings}
			selectionTitleOverride={selectionTitleOverride}
			initialPosition={activePosition}
			onPositionChange={onPositionChange}
			onSideChange={setTradeSide}
			venueOverride={venueOverride}
			crossBuyYes={tradingPagePrices.bestYesPrice}
			crossBuyNo={tradingPagePrices.bestNoPrice}
			venueRowsForSellStrip={pandascoreMatchId ? tradingPagePrices.venueRows : undefined}
			mobilePeekBar={mobilePeekBar}
			tradeRouteIsolationKey={compactTradeDock ? tradeRouteIsolationKey : undefined}
		/>
	);
}
