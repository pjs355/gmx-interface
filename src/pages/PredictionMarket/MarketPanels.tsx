import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useMedia } from "react-use";
import { FaChartLine } from "react-icons/fa";
import PredictionMarketChart from "./PredictionMarketChart";
import OrderbookDisplay from "components/OrderbookDisplay/OrderbookDisplay";
import { UmbrellaTradeBoxPanel } from "./UmbrellaTradeBoxPanel";
// import RulesSection from "components/RulesSection/RulesSection"; // Hidden for now (Rules / Match Winner / Show More)
import { StreamEmbed } from "./StreamEmbed";
import { Comments } from "./Comments/Comments";
import { EsportsVenueBooksPanel } from "@/components/EsportsVenueBooksPanel/EsportsVenueBooksPanel";
import { VenueOrderbooksPanel } from "@/components/VenueOrderbooksPanel/VenueOrderbooksPanel";
import { MarketHeader } from "./MarketHeader";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "@/components/PredictionMarketTradeBox";
import type { SettledInfo } from "./useMatchSettled";
import {
	getMarketId,
	hasUsableOrderbookSnapshot,
	levelUpOrderbookHasRestingShares,
	resolveLevelUpOrderbookKey,
} from "./utils";
import { useUmbrellaTradePricing } from "./useUmbrellaTradePricing";
import {
	isThreeWayMoneylineQuestions,
	orderThreeWayLegs,
	threeWayLegColor,
	threeWayLegLabel,
} from "@/features/markets/listing/threeWayMoneyline";
import {
	groupWinnerGroupLabel,
	groupWinnerLegColor,
	groupWinnerLegLabel,
	isGroupWinnerQuestions,
	orderGroupWinnerLegs,
} from "@/features/markets/listing/groupWinner";
import GroupWinnerChart from "./PredictionMarketChart/GroupWinnerChart";
import { ThreeWayVenueBooksPanel } from "./ThreeWayVenueBooksPanel";
import { ThreeWayLegSelector } from "./ThreeWayLegSelector";
import { GroupWinnerVenueBooksPanel } from "./GroupWinnerVenueBooksPanel";
import { GroupWinnerLegSelector } from "./GroupWinnerLegSelector";
import { resolveTeamLogoUrl } from "@/features/markets/assets/teamLogo";
import { resolveUmbrellaEventDate } from "@/pages/Predictions/utils/eventDates";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { ChartSkeleton, OrderbookSkeleton } from "./Skeletons";
import { formatUmbrellaTitleForTradingPage } from "@/features/markets/presentation/umbrellaDisplayName";

type PanelsProps = {
	umbrella: Umbrella;
	titleRef: React.RefObject<HTMLHeadingElement>;
	sortedQuestions: PredictionMarket[];
	questionOrderbooks: Record<string, any>;
	activeMarket: PredictionMarket | null;
	activePosition: "yes" | "no";
	onMarketSwitch: (q: PredictionMarket, p: "yes" | "no") => void;
	onMarketSwitchWithOrderbook: (q: PredictionMarket, p: "yes" | "no") => void;
	onPositionChange: (p: "yes" | "no") => void;
	fetchAllOrderbooks: (qs: PredictionMarket[]) => Promise<void>;
	chartState: {
		isInitialized: boolean;
		primaryQuestionId: string;
		primaryMarket: any;
		secondaryMarket: any | null;
		frozenOrderbooks: Record<string, any>;
	};
	settledInfo?: SettledInfo | null;
};

export const MarketPanels: React.FC<PanelsProps> = ({
	umbrella,
	titleRef,
	sortedQuestions,
	questionOrderbooks,
	activeMarket,
	activePosition,
	onMarketSwitch,
	onMarketSwitchWithOrderbook,
	onPositionChange,
	fetchAllOrderbooks,
	chartState,
	settledInfo,
}) => {
	/*
	 * Drives single-instance rendering of `<UmbrellaTradeBoxPanel>` below.
	 * Both layouts (`.desktop-layout` / `.mobile-layout`) live in the tree
	 * for CSS layout reasons, but the trade box renders a `Portal` curtain
	 * that escapes `display:none`, so mounting both at once stacks two
	 * curtains on the body. Render only the active viewport's instance.
	 */
	const isMobileViewport = useMedia("(max-width: 1100px)");

	const umbrellaTradingTitle = useMemo(
		() => formatUmbrellaTitleForTradingPage(umbrella),
		[umbrella.displayName, umbrella.game],
	);

	// Track buy/sell side state
	const [tradeSide] = useState<"buy" | "sell">("buy");
	const [activeTab, setActiveTab] = useState<"basic" | "orderbooks">("basic");
	const [venueForTradeBox, setVenueForTradeBox] = useState<TradingVenue | undefined>(undefined);
	/** Default to chart so the stream iframe doesn't auto-load on page open.
	 * The embed only mounts when the user selects Livestream (desktop + mobile). */
	const [mediaTab, setMediaTab] = useState<"chart" | "livestream">("chart");

	const selectVenueBooksTab = useCallback((tab: "basic" | "orderbooks") => {
		setActiveTab(tab);
		if (tab === "basic") {
			setVenueForTradeBox("all");
		}
	}, []);

	const umbrellaLimitless = umbrella?.exchangeMatching?.limitless;

	const firstQuestion = sortedQuestions[0] ?? null;
	/** `PredictionMarket` `activeMarket` can lag one frame; trade box skeletons forever on null. */
	const tradeBoxActiveMarket = activeMarket ?? firstQuestion;

	const { tradingPagePrices, pandascoreMatchId } = useUmbrellaTradePricing({
		umbrella,
		activeQuestion: tradeBoxActiveMarket,
	});
	const hasQuestions = sortedQuestions && sortedQuestions.length > 0;
	const settledView = Boolean(settledInfo);
	/** Same key as chart + `primaryChartOrderbook` (multiplex map); not always `resolveLevelUpOrderbookKey`. */
	const chartQuestionId =
		chartState.primaryQuestionId ||
		getMarketId(chartState.primaryMarket) ||
		(hasQuestions ? getMarketId(sortedQuestions[0]) : "");
	const primaryChartOrderbook = chartQuestionId ? questionOrderbooks[chartQuestionId] : undefined;
	const levelUpOrderbookKey = resolveLevelUpOrderbookKey(
		sortedQuestions,
		(umbrella?.exchangeMatching as { levelup?: { questionId?: string } } | undefined)?.levelup
			?.questionId ?? null,
	);
	const levelUpOrderbook = levelUpOrderbookKey
		? (questionOrderbooks[levelUpOrderbookKey] ?? null)
		: null;
	/** LevelUp line on the chart when the LevelUp book has resting shares. */
	const chartLevelUpBookHasRestingShares = levelUpOrderbookHasRestingShares(levelUpOrderbook);
	const levelUpContextMarket =
		(levelUpOrderbookKey
			? sortedQuestions.find((q) => getMarketId(q) === levelUpOrderbookKey)
			: null) ?? firstQuestion;
	const showCrossVenueBooks = Boolean(pandascoreMatchId);
	const streamUrl = typeof umbrella?.streamUrl === "string" ? umbrella.streamUrl : "";
	const showStream = Boolean(umbrella?.streamEnabled) && streamUrl.length > 0;

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("MarketPanels venue / tab state", {
			pandascoreMatchId: pandascoreMatchId || null,
			activeTab,
			showCrossVenueBooks,
			tradingPageSource: tradingPagePrices.source,
			tradingPageBestYes: tradingPagePrices.bestYesPrice,
			tradingPageBestNo: tradingPagePrices.bestNoPrice,
			note: "Basic tab = EsportsVenueBooksPanel; Orderbooks = VenueOrderbooksPanel (MatchedMarket + multiplex LevelUp orderbook).",
		});
	}, [
		pandascoreMatchId,
		activeTab,
		showCrossVenueBooks,
		tradingPagePrices.source,
		tradingPagePrices.bestYesPrice,
		tradingPagePrices.bestNoPrice,
	]);

	// Debug: Uncomment to track MarketPanels re-renders
	// console.log("🎬 MarketPanels rendering", {
	// 	chartPrimaryId: chartState.primaryQuestionId,
	// 	sortedQuestionsLength: sortedQuestions?.length || 0,
	// 	hasQuestions,
	// });

	// Memoize the chart market objects to prevent recreating them on every render
	const chartPrimaryMarket = React.useMemo(() => {
		return chartState.primaryMarket
			? {
					...(chartState.primaryMarket as any),
					umbrellaChildrenCount: umbrella?.children?.length || 0,
				}
			: undefined;
	}, [chartState.primaryMarket, umbrella?.children?.length]);

	const chartSecondaryMarket = React.useMemo(() => {
		return chartState.secondaryMarket
			? {
					...(chartState.secondaryMarket as any),
					umbrellaChildrenCount: umbrella?.children?.length || 0,
				}
			: undefined;
	}, [chartState.secondaryMarket, umbrella?.children?.length]);

	/**
	 * Team visuals + kickoff for the centered chart match header (logo · date ·
	 * logo). 3-way (FIFA) legs carry their own flag on `question.image`; esports
	 * "vs" markets resolve from the umbrella's team mappings (mapping[0] = YES =
	 * team A, mapping[1] = NO = team B), matching the chart's Yes/No labels.
	 */
	const chartHeaderTeams = React.useMemo(() => {
		const isThreeWay = isThreeWayMoneylineQuestions(sortedQuestions);
		let teamALogoUrl: string | null = null;
		let teamBLogoUrl: string | null = null;
		if (isThreeWay) {
			const a = (chartPrimaryMarket as { image?: unknown } | undefined)?.image;
			const b = (chartSecondaryMarket as { image?: unknown } | undefined)?.image;
			teamALogoUrl = typeof a === "string" && a.trim() !== "" ? a.trim() : null;
			teamBLogoUrl = typeof b === "string" && b.trim() !== "" ? b.trim() : null;
		} else {
			const mappings = umbrella?.teamMappings;
			if (Array.isArray(mappings)) {
				teamALogoUrl = resolveTeamLogoUrl(mappings[0]) ?? null;
				teamBLogoUrl = resolveTeamLogoUrl(mappings[1]) ?? null;
			}
		}
		const eventDate = umbrella ? resolveUmbrellaEventDate(umbrella) : null;
		return {
			teamALogoUrl,
			teamBLogoUrl,
			eventDateMs: eventDate ? eventDate.getTime() : null,
		};
	}, [sortedQuestions, chartPrimaryMarket, chartSecondaryMarket, umbrella]);

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

	const bookMarket = activeMarket ?? sortedQuestions[0] ?? null;
	const bookMarketId = bookMarket ? getMarketId(bookMarket) || "" : "";

	/** 3-way moneyline (FIFA): order the order-book tabs home/away/draw and label
	 * each by its short outcome name ("Korea" / "Czechia" / "Draw"). */
	const isThreeWay = isThreeWayMoneylineQuestions(sortedQuestions);
	/** FIFA "Group X Winner" prop: N team legs (no Draw), each its own binary market. */
	const isGroupWinner = isGroupWinnerQuestions(sortedQuestions);
	/** Both 3-way moneyline and group-winner share the multi-leg YES UI (leg pills,
	 * cross-venue table, inline selector) — only the ordering + label/color differ. */
	const isMultiLeg = isThreeWay || isGroupWinner;
	const pillQuestions = isGroupWinner
		? orderGroupWinnerLegs(sortedQuestions)
		: isThreeWay
			? orderThreeWayLegs(sortedQuestions)
			: sortedQuestions;

	/** Label for a multi-leg outcome — team short name (group winner) or
	 * home/away/draw name (moneyline). */
	const legLabelFor = (question: PredictionMarket, _index: number): string =>
		isGroupWinner ? groupWinnerLegLabel(question) : threeWayLegLabel(question);
	/** Outcome color — stable per-team palette (group winner) or team color +
	 * neutral Draw (moneyline). */
	const legColorFor = (question: PredictionMarket, index: number): string =>
		isGroupWinner ? groupWinnerLegColor(question, index) : threeWayLegColor(question);

	/** Multi-leg (FIFA) leg selector for the Orderbooks tab: per-outcome buttons
	 * that replace the orderbook's Yes/No tabs. Selecting a leg switches the active
	 * market to that leg's YES book (and YES bet in the trade box). */
	const multiLegOutcomeTabs =
		isMultiLeg && pillQuestions.length > 1
			? pillQuestions
					.filter((q): q is PredictionMarket => Boolean(q))
					.map((question, index) => {
						const qid = getMarketId(question) || "";
						return {
							id: qid,
							label: legLabelFor(question, index),
							active: qid === bookMarketId,
							onSelect: () => onMarketSwitch(question, "yes"),
							color: legColorFor(question, index),
						};
					})
			: undefined;

	const defaultOrderbookContent = (
		<>
			{sortedQuestions.length > 1 && (
				<div
					className="venue-orderbooks-pill-strip venue-tab-switcher orderbook-question-pill-strip"
					role="tablist"
					aria-label="Markets"
				>
					{pillQuestions.map((question, index) => {
						if (!question) return null;
						const qid = getMarketId(question) || "";
						const isActive = Boolean(activeMarket) && getMarketId(activeMarket) === qid;
						const pillLabel = isMultiLeg
							? legLabelFor(question, index)
							: question.displayName || (question as any).question || "Market";
						return (
							<button
								key={qid}
								type="button"
								role="tab"
								aria-selected={isActive}
								className={`venue-tab-btn${isActive ? " venue-tab-btn--active" : ""}`}
								onClick={() => onMarketSwitch(question, activePosition)}
							>
								{pillLabel}
							</button>
						);
					})}
				</div>
			)}
			{bookMarket && (
				<div key={bookMarketId} className="question-orderbook">
					<OrderbookDisplay
						layout="embedded"
						orderbook={questionOrderbooks[bookMarketId]}
						loading={!questionOrderbooks[bookMarketId]}
						error={null}
						onRefresh={() => fetchAllOrderbooks(sortedQuestions)}
						customTitle={
							isMultiLeg
								? legLabelFor(bookMarket, 0)
								: bookMarket.displayName || (bookMarket as any).question
						}
						market={
							{
								...(bookMarket as any),
								umbrellaChildrenCount: umbrella?.children?.length || 0,
							} as any
						}
						umbrellaDisplayName={umbrellaTradingTitle}
						onMarketSwitch={onMarketSwitch}
						onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
						isActiveMarket
						activePosition={activePosition}
						isCollapsed={false}
						side={tradeSide}
						wholeContractRestingBook
					/>
				</div>
			)}
		</>
	);

	const orderbookColumnContent = settledView ? null : showCrossVenueBooks ? ( // <RulesSection umbrella={umbrella} />
		activeTab === "basic" ? (
			<>
				<div className="orderbook-section__cross-venue">
					{isGroupWinner ? (
						/* FIFA group winner: esports Basic table generalized to N team
						   columns, each venue's best YES per team leg. */
						<GroupWinnerVenueBooksPanel legs={pillQuestions} />
					) : isThreeWay ? (
						/* FIFA 3-way: esports Basic table with a third outcome column
						   (Team A / Team B / Draw), each venue's best YES per leg. */
						<ThreeWayVenueBooksPanel legs={pillQuestions} />
					) : (
						<EsportsVenueBooksPanel tradingPagePrices={tradingPagePrices} />
					)}
				</div>
				{/* <RulesSection umbrella={umbrella} /> */}
			</>
		) : (
			<>
				<VenueOrderbooksPanel
					pandascoreMatchId={pandascoreMatchId}
					umbrellaId={umbrella._id}
					limitlessFromUmbrella={umbrellaLimitless}
					levelUpOrderbook={levelUpOrderbook}
					market={
						levelUpContextMarket
							? ({
									...(levelUpContextMarket as any),
									umbrellaChildrenCount: umbrella?.children?.length || 0,
								} as any)
							: undefined
					}
					umbrellaDisplayName={umbrellaTradingTitle}
					onMarketSwitch={onMarketSwitch}
					onVenueSelect={setVenueForTradeBox}
					activePosition={activePosition}
					side={tradeSide}
					outcomeTabs={multiLegOutcomeTabs}
				/>
				{/* <RulesSection umbrella={umbrella} /> */}
			</>
		)
	) : (
		defaultOrderbookContent
	);

	const orderbookSectionBody =
		settledView || hasQuestions ? (
			orderbookColumnContent
		) : (
			<>
				<OrderbookSkeleton />
				<OrderbookSkeleton />
			</>
		);

	// Chart only needs a usable snapshot for the primary chart market; settledView does not change this condition
	const showChartBlock = hasQuestions && hasUsableOrderbookSnapshot(primaryChartOrderbook);
	const showChartPlaceholder = !showChartBlock && !(settledView && !hasQuestions);

	// Order inside .venue-books-container: chart → tabs → "Prediction Market Odds" → tab body (e.g. esports table).
	const chartAtTopOfVenueBooks = showChartBlock ? (
		<div
			className="ExchangeChart venue-books-chart"
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 300,
			}}
		>
			<div
				className="prediction-market-chart-shell flex grow flex-col overflow-visible rounded-4 bg-black"
				style={{ minHeight: 300 }}
			>
				{isGroupWinner ? (
					<GroupWinnerChart
						legs={pillQuestions}
						title={
							groupWinnerGroupLabel(pillQuestions)
								? `${groupWinnerGroupLabel(pillQuestions)} Winner`
								: undefined
						}
					/>
				) : (
					<PredictionMarketChart
						questionId={chartQuestionId}
						umbrellaId={umbrella?._id}
						pandaMatchId={pandascoreMatchId || undefined}
						limitlessFromUmbrella={umbrellaLimitless}
						levelUpOrderbookHasRestingShares={chartLevelUpBookHasRestingShares}
						umbrellaDisplayName={umbrellaTradingTitle}
						activeMarket={chartPrimaryMarket}
						secondMarket={chartSecondaryMarket}
						questionOrderbooks={questionOrderbooks}
						teamALogoUrl={chartHeaderTeams.teamALogoUrl}
						teamBLogoUrl={chartHeaderTeams.teamBLogoUrl}
						eventDateMs={chartHeaderTeams.eventDateMs ?? undefined}
					/>
				)}
			</div>
		</div>
	) : showChartPlaceholder ? (
		<div
			className="ExchangeChart venue-books-chart venue-books-chart-skeleton"
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 300,
			}}
		>
			<div
				className="prediction-market-chart-shell flex grow flex-col overflow-visible rounded-4 bg-black"
				style={{ minHeight: 300 }}
			>
				<ChartSkeleton />
			</div>
		</div>
	) : null;

	const venueBooksOddsNoun = isGroupWinner ? "Group winner" : "Moneyline";
	const venueBooksSectionTitle =
		showCrossVenueBooks && activeTab === "orderbooks"
			? `${venueBooksOddsNoun} orderbooks`
			: `${venueBooksOddsNoun} odds`;

	/** Multi-leg (FIFA) Basic view: inline outcome selector beside the heading so
	 * the user can flip outcomes without opening the Orderbooks tab. */
	const showMultiLegBasicSelector =
		isMultiLeg && activeTab === "basic" && pillQuestions.length > 1;

	const predictionMarketOddsHeading =
		showChartBlock || showChartPlaceholder ? (
			showMultiLegBasicSelector ? (
				<div className="prediction-market-odds-heading-row">
					<h3 className="prediction-market-odds-heading">{venueBooksSectionTitle}</h3>
					{isGroupWinner ? (
						<GroupWinnerLegSelector
							legs={pillQuestions}
							activeMarketId={bookMarketId}
							onSelect={(q) => onMarketSwitch(q, "yes")}
						/>
					) : (
						<ThreeWayLegSelector
							legs={pillQuestions}
							activeMarketId={bookMarketId}
							onSelect={(q) => onMarketSwitch(q, "yes")}
						/>
					)}
				</div>
			) : (
				<h3 className="prediction-market-odds-heading">{venueBooksSectionTitle}</h3>
			)
		) : null;

	/* Chart / Livestream toggle when this umbrella has a stream URL. */
	const mediaTabSwitcher = showStream ? (
		<div className="media-tab-switcher" role="tablist" aria-label="Chart or livestream">
			<button
				type="button"
				role="tab"
				aria-selected={mediaTab === "chart"}
				className={`media-tab-btn${mediaTab === "chart" ? " media-tab-btn--active" : ""}`}
				onClick={() => setMediaTab("chart")}
			>
				<FaChartLine className="media-tab-btn__icon" aria-hidden="true" />
				<span>Chart</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mediaTab === "livestream"}
				className={`media-tab-btn${mediaTab === "livestream" ? " media-tab-btn--active" : ""}`}
				onClick={() => setMediaTab("livestream")}
			>
				<span className="media-tab-btn__live-dot" aria-hidden="true" />
				<span>Livestream</span>
			</button>
		</div>
	) : null;

	const streamBlock = showStream ? (
		<div className="venue-books-stream">
			<StreamEmbed streamUrl={streamUrl} height={isMobileViewport ? "360" : "720"} />
		</div>
	) : null;

	const renderVenueBooksContainer = (orderbookSectionClass: string) => (
		<div className="venue-books-container">
			{mediaTabSwitcher}
			{mediaTab === "livestream" && showStream ? streamBlock : chartAtTopOfVenueBooks}
			{tabSwitcher}
			{predictionMarketOddsHeading}
			<div className={orderbookSectionClass}>{orderbookSectionBody}</div>
		</div>
	);

	return (
		<div className="prediction-market-content">
			{/* Desktop Layout */}
			<div className="desktop-layout">
				<div className="left-panel">
					{/* Sit the umbrella header inside the left column so the
					    sticky trade box on the right starts at the same Y as
					    the header (matches the home-page layout) instead of
					    being pushed down by a full-width black bar. */}
					{umbrella && <MarketHeader umbrella={umbrella} titleRef={titleRef} />}

					{renderVenueBooksContainer("orderbook-section")}

					{/* Comments Section */}
					{umbrella && (
						<Comments umbrellaId={umbrella._id} markets={sortedQuestions as PredictionMarket[]} />
					)}
				</div>

				<div className="right-panel">
					{!isMobileViewport && (
						<UmbrellaTradeBoxPanel
							umbrella={umbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
							onPositionChange={onPositionChange}
							settledInfo={settledInfo ?? null}
							tradingPagePrices={tradingPagePrices}
							venueOverride={venueForTradeBox}
						/>
					)}
				</div>
			</div>

			{/* Mobile Layout */}
			<div className="mobile-layout">
				{/* Single-column on mobile, so the header sits at the very top
				    of the stack as the page title. */}
				{umbrella && <MarketHeader umbrella={umbrella} titleRef={titleRef} />}

				{/* Chart / Livestream tab sits above the chart so users can
				    opt in to the stream rather than auto-loading it. */}
				{renderVenueBooksContainer("orderbook-section-mobile")}

				{/* Comments Section */}
				{umbrella && (
					<Comments umbrellaId={umbrella._id} markets={sortedQuestions as PredictionMarket[]} />
				)}

				{/* Mobile Trading Container - Fixed at bottom */}
				<div className="mobile-trading-container">
					{isMobileViewport && (
						<UmbrellaTradeBoxPanel
							umbrella={umbrella}
							questionOrderbooks={questionOrderbooks}
							activeMarket={tradeBoxActiveMarket}
							activePosition={activePosition}
							onPositionChange={onPositionChange}
							settledInfo={settledInfo ?? null}
							tradingPagePrices={tradingPagePrices}
							venueOverride={venueForTradeBox}
						/>
					)}
				</div>
			</div>
		</div>
	);
};
