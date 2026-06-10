import React, { useCallback, useMemo } from "react";
import OrderbookDisplay from "components/OrderbookDisplay/OrderbookDisplay";
import { EsportsVenueBooksPanel } from "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel";
import { VenueOrderbooksPanel } from "@/components/VenueOrderbooksPanel/VenueOrderbooksPanel";
import { ThreeWayVenueBooksPanel } from "./ThreeWayVenueBooksPanel";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "@/components/PredictionMarketTradeBox";
import { getMarketId, resolveLevelUpOrderbookKey } from "./utils";
import { useUmbrellaTradePricing } from "./useUmbrellaTradePricing";
import {
	matchPropSelectionTitle,
	propVenueColumnHeaders,
} from "@/features/markets/listing/matchProps";
import {
	orderThreeWayLegs,
	threeWayLegColor,
	threeWayLegLabel,
} from "@/features/markets/listing/threeWayMoneyline";
import {
	resolveCategoryEffectiveSelection,
	type MatchMarketCategory,
} from "@/features/markets/presentation/matchMarketCategories";
import type { PropLadder } from "@/features/markets/listing/matchProps";
import { OrderbookSkeleton } from "./Skeletons";

export type MatchCategorySectionBodyProps = {
	category: MatchMarketCategory;
	umbrella: Umbrella;
	umbrellaTradingTitle: string;
	moneylineLegs: PredictionMarket[];
	ladders: PropLadder[];
	sortedQuestions: PredictionMarket[];
	questionOrderbooks: Record<string, any>;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	activeSelectionTitle?: string | null;
	activeTab: "basic" | "orderbooks";
	onTabChange: (tab: "basic" | "orderbooks") => void;
	onMarketSwitch: (
		q: PredictionMarket,
		p: "yes" | "no",
		selectionTitle?: string | null,
	) => void;
	onMarketSwitchWithOrderbook: (
		q: PredictionMarket,
		p: "yes" | "no",
		selectionTitle?: string | null,
	) => void;
	fetchAllOrderbooks: (qs: PredictionMarket[]) => Promise<void>;
	settledView: boolean;
	fifaGameTeamColorBySlug?: Record<string, string> | null;
	onVenueSelect: (venue: TradingVenue | undefined) => void;
};

/**
 * Expanded body for a match market category accordion section — Basic /
 * Orderbooks tabs and orderbook panels only. The moneyline chart stays fixed
 * at the top of the venue-books container (same as esports).
 */
export function MatchCategorySectionBody({
	category,
	umbrella,
	umbrellaTradingTitle,
	moneylineLegs,
	ladders,
	sortedQuestions,
	questionOrderbooks,
	activeMarket,
	activePosition,
	activeSelectionTitle,
	activeTab,
	onTabChange,
	onMarketSwitch,
	onMarketSwitchWithOrderbook,
	fetchAllOrderbooks,
	settledView,
	fifaGameTeamColorBySlug,
	onVenueSelect,
}: MatchCategorySectionBodyProps) {
	const effective = useMemo(
		() =>
			resolveCategoryEffectiveSelection(
				category,
				activeMarket,
				activePosition,
				moneylineLegs,
				ladders,
			),
		[category, activeMarket, activePosition, moneylineLegs, ladders],
	);

	const effectiveMarket = effective.market;
	const effectivePosition = effective.position;
	const bookMarketId = effectiveMarket ? getMarketId(effectiveMarket) || "" : "";

	const { tradingPagePrices, pandascoreMatchId } = useUmbrellaTradePricing({
		umbrella,
		activeQuestion: effectiveMarket,
	});

	const venueBooksPrices = useMemo(() => {
		const headers = propVenueColumnHeaders(effectiveMarket, umbrella?.teamMappings);
		if (!headers) return tradingPagePrices;
		return { ...tradingPagePrices, teamA: headers.teamA, teamB: headers.teamB };
	}, [tradingPagePrices, effectiveMarket, umbrella?.teamMappings]);

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;
	const showCrossVenueBooks = Boolean(pandascoreMatchId);

	const exchangeMatchingLevelupQuestionId =
		(umbrella?.exchangeMatching as { levelup?: { questionId?: string } } | undefined)?.levelup
			?.questionId ?? null;

	const levelUpOrderbookKey = effectiveMarket
		? resolveLevelUpOrderbookKey([effectiveMarket], exchangeMatchingLevelupQuestionId)
		: null;
	const levelUpOrderbook = levelUpOrderbookKey
		? (questionOrderbooks[levelUpOrderbookKey] ?? null)
		: null;

	const pillQuestions = orderThreeWayLegs(moneylineLegs);

	const multiLegOutcomeTabs =
		category === "moneyline" && pillQuestions.length > 1
			? pillQuestions.map((question, index) => {
					const qid = getMarketId(question) || "";
					return {
						id: qid,
						label: threeWayLegLabel(question),
						active: qid === bookMarketId,
						onSelect: () => onMarketSwitch(question, "yes"),
						color: threeWayLegColor(question, fifaGameTeamColorBySlug),
					};
				})
			: undefined;

	const selectVenueBooksTab = useCallback(
		(tab: "basic" | "orderbooks") => {
			onTabChange(tab);
			if (tab === "basic") onVenueSelect("all");
		},
		[onTabChange, onVenueSelect],
	);

	const tabSwitcher =
		showCrossVenueBooks && !settledView ? (
			<div className="venue-tab-switcher">
				<button
					className={`venue-tab-btn${activeTab === "basic" ? " venue-tab-btn--active" : ""}`}
					onClick={() => selectVenueBooksTab("basic")}
				>
					Basic
				</button>
				<button
					className={`venue-tab-btn${activeTab === "orderbooks" ? " venue-tab-btn--active" : ""}`}
					onClick={() => selectVenueBooksTab("orderbooks")}
				>
					Orderbooks
				</button>
			</div>
		) : null;

	const customOrderbookTitle =
		effectiveMarket &&
		((effectiveMarket as { marketType?: unknown }).marketType === "spread" ||
			(effectiveMarket as { marketType?: unknown }).marketType === "total")
			? matchPropSelectionTitle(effectiveMarket, effectivePosition, umbrella?.teamMappings)
			: activeSelectionTitle?.trim() ||
				(category === "moneyline" && effectiveMarket
					? threeWayLegLabel(effectiveMarket)
					: effectiveMarket?.displayName || (effectiveMarket as any)?.question);

	const orderbookColumnContent = settledView ? null : showCrossVenueBooks ? (
		activeTab === "basic" ? (
			<div className="orderbook-section__cross-venue">
				{category === "moneyline" ? (
					<ThreeWayVenueBooksPanel legs={pillQuestions} teamMappings={umbrella.teamMappings} />
				) : (
					<EsportsVenueBooksPanel tradingPagePrices={venueBooksPrices} />
				)}
			</div>
		) : (
			<VenueOrderbooksPanel
				pandascoreMatchId={pandascoreMatchId}
				umbrellaId={umbrella._id}
				limitlessFromUmbrella={umbrellaLimitless}
				levelUpOrderbook={levelUpOrderbook}
				market={
					effectiveMarket
						? ({
								...(effectiveMarket as any),
								umbrellaChildrenCount: umbrella?.children?.length || 0,
							} as any)
						: undefined
				}
				umbrellaDisplayName={umbrellaTradingTitle}
				umbrellaTeamMappings={umbrella?.teamMappings}
				onMarketSwitch={onMarketSwitch}
				onVenueSelect={onVenueSelect}
				activePosition={effectivePosition}
				side="buy"
				outcomeTabs={multiLegOutcomeTabs}
			/>
		)
	) : effectiveMarket ? (
		<div key={bookMarketId} className="question-orderbook">
			<OrderbookDisplay
				layout="embedded"
				orderbook={questionOrderbooks[bookMarketId]}
				loading={!questionOrderbooks[bookMarketId]}
				error={null}
				onRefresh={() => fetchAllOrderbooks(sortedQuestions)}
				customTitle={customOrderbookTitle}
				umbrellaTeamMappings={umbrella?.teamMappings}
				market={
					{
						...(effectiveMarket as any),
						umbrellaChildrenCount: umbrella?.children?.length || 0,
					} as any
				}
				umbrellaDisplayName={umbrellaTradingTitle}
				onMarketSwitch={onMarketSwitch}
				onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
				isActiveMarket={effective.inCategory}
				activePosition={effectivePosition}
				isCollapsed={false}
				side="buy"
				wholeContractRestingBook
			/>
		</div>
	) : null;

	const sectionTitle =
		category === "moneyline"
			? activeTab === "orderbooks"
				? "Moneyline orderbooks"
				: "Moneyline odds"
			: category === "spread"
				? activeTab === "orderbooks"
					? "Spread orderbooks"
					: "Spread odds"
				: activeTab === "orderbooks"
					? "Total Goals orderbooks"
					: "Total Goals odds";

	return (
		<>
			{tabSwitcher}
			{!settledView && category !== "moneyline" ? (
				<h3 className="prediction-market-odds-heading">{sectionTitle}</h3>
			) : null}
			<div className="orderbook-section">
				{settledView ? null : orderbookColumnContent ?? <OrderbookSkeleton />}
			</div>
		</>
	);
}
