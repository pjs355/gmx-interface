import { useState, useEffect, useMemo, useRef, useLayoutEffect, type ReactNode } from "react";
import { useNavigate, useNavigationType } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { PredictionCard } from "./PredictionCard";
import { LoadingState } from "./LoadingState";
import { HomeSkeleton } from "./HomeSkeleton";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import "../Predictions.scss";
import GameLinks from "./GameLinks";
import { HomeInlineTradeLayout } from "./HomeInlineTradeLayout";
import PredictionsCalendarOddsPicker from "./PredictionsCalendarOddsPicker";
import { resolveUmbrellaEventDate, startOfLocalDay } from "../utils/eventDates";
import { useVenuePandaSubscription } from "@/context/VenuePandaSubscriptionContext";
import { pandaVenueWireKeys } from "@/features/markets/presentation/pandaOddsRows";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import {
	getListingYesNoPricesForUmbrella,
	isDeemphasizedSettledLeanOdds,
} from "@/features/markets/listing/umbrellaListingOdds";
import {
	findEsportsTag,
	gameFilterResetSelection,
	isEsportsMetaTagLabel,
	isUmbrellaLiveByEventDate,
	isUmbrellaStartingSoonByEventDate,
	isSpecificGameTagSelection,
	filterHomeCatalogUmbrellas,
	resolveInitialHomeGameFilter,
	LIVE_PILL_ID,
	STARTING_SOON_PILL_ID,
	umbrellaHasTagId,
	umbrellaMatchesHomeFilterType,
	useNowTick,
} from "../utils/gameLinkFilters";
import { resolveHomeMatchWinnerQuestion } from "@/features/markets/presentation/esportsHomeCard";
import { consumeHomePendingGameFilter, setHomeGameFilter } from "../utils/gameFilterNavigation";
import {
	clearHomeCatalogScroll,
	HOME_CATALOG_SCROLL_RETRY_MS,
	restoreHomeCatalogScrollIfPending,
	saveHomeCatalogScroll,
	subscribeHomeCatalogScrollSave,
} from "../utils/homeScrollRestore";
import { isRestrictedProductionMode } from "@/config/restrictedMode";
import { isRestrictedProductionUmbrella } from "@/features/markets/presentation/umbrellaGame";
import { resolveMarketBackgroundUrl } from "../utils/marketBackgrounds";
import {
	bundledGameLogoFromTagLabels,
	resolveLogoByTags,
} from "@/features/markets/assets/gameLogoResolver";
import { preloadPredictionMarketRoute } from "@/app/routes/predictionMarketRouteLazy";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours — matches Home.tsx

type CalendarEvent = { umbrella: Umbrella; eventDate: Date };

function getPlayOrderTier(eventMs: number, now: number): number {
	if (now < eventMs) return 1; // upcoming
	if (now >= eventMs && now - eventMs <= LIVE_WINDOW_MS) return 0; // live
	return 2; // ended
}

function sortCalendarEventsByPlayOrder(
	events: CalendarEvent[],
	now: number,
	scoreDead: (umbrella: Umbrella) => number,
): void {
	events.sort((left, right) => {
		const leftMs = left.eventDate.getTime();
		const rightMs = right.eventDate.getTime();
		const leftTier = getPlayOrderTier(leftMs, now);
		const rightTier = getPlayOrderTier(rightMs, now);
		if (leftTier !== rightTier) return leftTier - rightTier;

		// Live tier: push "settled-lean" listing odds to the bottom
		if (leftTier === 0) {
			const dL = scoreDead(left.umbrella);
			const dR = scoreDead(right.umbrella);
			if (dL !== dR) return dL - dR;
		}

		return leftMs - rightMs;
	});
}

// Sort umbrellas by trading activity (number of trades across all children markets)
function sortByTradingActivity(array: Umbrella[]): Umbrella[] {
	return [...array].sort((a, b) => {
		const aChildren = (a as any).children || [];
		const aTradeCount = aChildren.reduce((sum: number, child: any) => {
			return sum + (child?.tradeCount ?? child?.historicalPrices?.length ?? 0);
		}, 0);

		const bChildren = (b as any).children || [];
		const bTradeCount = bChildren.reduce((sum: number, child: any) => {
			return sum + (child?.tradeCount ?? child?.historicalPrices?.length ?? 0);
		}, 0);

		return bTradeCount - aTradeCount;
	});
}

function buildDayKey(date: Date): string {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const paddedMonth = month < 10 ? `0${month}` : `${month}`;
	const paddedDay = day < 10 ? `0${day}` : `${day}`;
	return `${year}-${paddedMonth}-${paddedDay}`;
}

function formatDayLabel(
	targetDate: Date,
	todayStartMs: number,
): { primary: string; secondary: string } {
	const dayStart = startOfLocalDay(targetDate);
	const diffMs = dayStart.getTime() - todayStartMs;
	const diffDays = Math.round(diffMs / DAY_IN_MS);

	let primary = "";
	if (diffDays === 0) {
		primary = "Today";
	} else if (diffDays === 1) {
		primary = "Tomorrow";
	} else if (diffDays === -1) {
		primary = "Yesterday";
	} else {
		primary = targetDate.toLocaleDateString(undefined, {
			weekday: "long",
		});
	}

	const secondary = targetDate.toLocaleDateString(undefined, {
		month: "long",
		day: "numeric",
	});

	return { primary, secondary };
}

interface FilteredPredictionsProps {
	filterType: "esports" | "games" | "all";
}

type CalendarDataForVisibility = {
	upcomingDays: { events: CalendarEvent[] }[];
	unscheduled: Umbrella[];
};

/** Same umbrella ordering as rendered cards (calendar vs flat grid); full list, no slicing. */
function collectVisibleUmbrellas(
	shouldUseCalendar: boolean,
	calendarData: CalendarDataForVisibility | null,
	filteredUmbrellas: Umbrella[],
): Umbrella[] {
	if (!shouldUseCalendar || !calendarData) {
		return filteredUmbrellas;
	}
	const out: Umbrella[] = [];
	for (const day of calendarData.upcomingDays) {
		for (const e of day.events) out.push(e.umbrella);
	}
	out.push(...calendarData.unscheduled);
	return out;
}

const DEFAULT_CALENDAR_PAGE_TITLE = "Trade Esport Matches";

function gameFilterDisplayLabel(selectedGame: string | null): string | null {
	if (!selectedGame) return null;
	if (selectedGame === LIVE_PILL_ID) return "Live";
	if (selectedGame === STARTING_SOON_PILL_ID) return "Starting Soon";
	if (isEsportsMetaTagLabel(selectedGame)) return "All";
	return selectedGame;
}

function calendarPageHeadingTitle(selectedGame: string | null): string {
	if (selectedGame === LIVE_PILL_ID) return "Live";
	if (selectedGame === STARTING_SOON_PILL_ID) return "Starting Soon";
	if (!selectedGame || isEsportsMetaTagLabel(selectedGame)) {
		return DEFAULT_CALENDAR_PAGE_TITLE;
	}
	return gameFilterDisplayLabel(selectedGame) ?? selectedGame;
}

function PredictionPageHeading({ selectedGame }: { selectedGame: string | null }) {
	const title = calendarPageHeadingTitle(selectedGame);
	const showGameLogo =
		selectedGame &&
		!isEsportsMetaTagLabel(selectedGame) &&
		selectedGame !== LIVE_PILL_ID &&
		selectedGame !== STARTING_SOON_PILL_ID;
	const gameLogo = showGameLogo
		? (bundledGameLogoFromTagLabels([selectedGame]) ?? resolveLogoByTags([selectedGame]))
		: null;

	return (
		<header className="prediction-calendar-page-heading">
			<div className="prediction-calendar-page-heading__title-row">
				{gameLogo ? (
					<img
						className="prediction-calendar-page-heading__game-logo"
						src={gameLogo}
						alt=""
						width={40}
						height={40}
						decoding="async"
					/>
				) : null}
				<h2 className="prediction-calendar-page-heading__title">{title}</h2>
			</div>
		</header>
	);
}

export default function FilteredPredictions({ filterType }: FilteredPredictionsProps) {
	const navigate = useNavigate();
	const navigationType = useNavigationType();
	const [selectedGame, setSelectedGame] = useState<string | null>(null);
	const [defaultTagApplied, setDefaultTagApplied] = useState(false);
	const scrollRestoreEligibleRef = useRef(navigationType === "POP");
	const [scrollSaveReady, setScrollSaveReady] = useState(!scrollRestoreEligibleRef.current);

	const {
		umbrellas,
		loading,
		error,
		singleMarketOrderbooks,
		singleMarketQuestions,
		multiMarketData,
		tags,
		tagsLoading,
	} = usePredictionData();

	// Trading sidebar → home: pending filter wins; else restore stored filter; else Live default.
	useEffect(() => {
		if (defaultTagApplied || tagsLoading) return;
		const pending = consumeHomePendingGameFilter();
		if (pending) {
			setSelectedGame(pending);
		} else {
			setSelectedGame(resolveInitialHomeGameFilter(tags));
		}
		setDefaultTagApplied(true);
	}, [tags, tagsLoading, defaultTagApplied]);

	useEffect(() => {
		if (!defaultTagApplied) return;
		setHomeGameFilter(selectedGame);
	}, [selectedGame, defaultTagApplied]);

	useEffect(() => {
		if (!scrollRestoreEligibleRef.current) {
			clearHomeCatalogScroll();
		}
	}, []);

	useEffect(() => {
		if (!scrollSaveReady) return;
		return subscribeHomeCatalogScrollSave();
	}, [scrollSaveReady]);

	// Prefetch umbrella trading route chunk so card clicks are not blocked on Suspense.
	useEffect(() => {
		preloadPredictionMarketRoute();
	}, []);

	// Listen for reset filter event from header
	useEffect(() => {
		const handleResetFilter = () => {
			clearHomeCatalogScroll();
			setSelectedGame(gameFilterResetSelection(tags));
		};

		window.addEventListener("resetGameFilter", handleResetFilter);
		return () => {
			window.removeEventListener("resetGameFilter", handleResetFilter);
		};
	}, [tags]);

	const { appState } = useOddsMonitor();
	const now = useNowTick(60_000);

	const restrictedMode = isRestrictedProductionMode();

	const filteredUmbrellas = useMemo(() => {
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			// Restricted production mode: hide umbrellas outside CS2 + LoL allowlist.
			if (restrictedMode && !isRestrictedProductionUmbrella(umbrella as any)) {
				return false;
			}
			return (umbrella as any).active === true;
		});

		const esportsTag = findEsportsTag(tags);
		const esportsTagId = esportsTag?._id;

		let filtered = activeUmbrellas.filter((umbrella) =>
			umbrellaMatchesHomeFilterType(umbrella, filterType, esportsTagId),
		);

		if (selectedGame && selectedGame !== LIVE_PILL_ID && selectedGame !== STARTING_SOON_PILL_ID) {
			const selectedTag = tags.find((t) => t.label === selectedGame);
			if (selectedTag && !isEsportsMetaTagLabel(selectedTag.label)) {
				filtered = filtered.filter((umbrella) => umbrellaHasTagId(umbrella, selectedTag._id));
			}
		}

		if (selectedGame === LIVE_PILL_ID) {
			filtered = filtered.filter((umbrella) =>
				isUmbrellaLiveByEventDate(umbrella, now, esportsTagId),
			);
		} else if (selectedGame === STARTING_SOON_PILL_ID) {
			filtered = filtered.filter((umbrella) =>
				isUmbrellaStartingSoonByEventDate(umbrella, now, esportsTagId),
			);
		}

		filtered = filterHomeCatalogUmbrellas(filtered, now, esportsTagId);

		if (filterType === "games") {
			return sortByTradingActivity(filtered);
		}

		return filtered;
	}, [umbrellas, filterType, selectedGame, tags, now, restrictedMode]);

	// Restore saved scrollY after browser back (retries until layout is tall enough).
	useLayoutEffect(() => {
		if (!scrollRestoreEligibleRef.current) return;
		if (loading || tagsLoading || !defaultTagApplied || selectedGame === null) return;

		let cancelled = false;
		let attempt = 0;

		const finish = () => {
			if (!cancelled) setScrollSaveReady(true);
		};

		const run = () => {
			if (cancelled) return;
			const done = restoreHomeCatalogScrollIfPending();
			if (done) {
				finish();
				return;
			}
			attempt += 1;
			if (attempt >= HOME_CATALOG_SCROLL_RETRY_MS.length) {
				clearHomeCatalogScroll();
				finish();
				return;
			}
			window.setTimeout(run, HOME_CATALOG_SCROLL_RETRY_MS[attempt]);
		};

		run();
		return () => {
			cancelled = true;
		};
	}, [loading, tagsLoading, defaultTagApplied, selectedGame, filteredUmbrellas.length]);

	const calendarData = useMemo(() => {
		if (filterType === "games") {
			return null;
		}

		const todayStart = startOfLocalDay(new Date());
		const todayStartMs = todayStart.getTime();

		type CalendarDay = { date: Date; events: CalendarEvent[] };

		const upcomingMap = new Map<string, CalendarDay>();
		const unscheduled: Umbrella[] = [];

		/*
		 * Past events (those whose local-day starts before today) are
		 * intentionally dropped: the home page should never surface markets
		 * older than today. Skipping them here means every downstream
		 * consumer (`collectVisibleUmbrellas`, the
		 * calendar JSX, the venue-WS subscription list) automatically
		 * excludes past umbrellas without each having to filter again.
		 */
		for (let index = 0; index < filteredUmbrellas.length; index += 1) {
			const umbrella = filteredUmbrellas[index];
			const eventDate = resolveUmbrellaEventDate(umbrella);
			if (eventDate === null) {
				unscheduled.push(umbrella);
				continue;
			}

			const dayStart = startOfLocalDay(eventDate);
			if (dayStart.getTime() < todayStartMs) {
				continue;
			}

			const key = buildDayKey(dayStart);
			const event: CalendarEvent = {
				umbrella,
				eventDate,
			};

			let day = upcomingMap.get(key);
			if (!day) {
				day = { date: dayStart, events: [] };
				upcomingMap.set(key, day);
			}
			day.events.push(event);
		}

		const sortByDate = (a: CalendarDay, b: CalendarDay) => a.date.getTime() - b.date.getTime();

		const scoreDead = (umbrella: Umbrella): number => {
			const { yes, no } = getListingYesNoPricesForUmbrella(umbrella, appState?.markets);
			return isDeemphasizedSettledLeanOdds(yes, no) ? 1 : 0;
		};

		const upcomingDays = Array.from(upcomingMap.values())
			.sort(sortByDate)
			.map((day) => {
				sortCalendarEventsByPlayOrder(day.events, now, scoreDead);
				return day;
			});

		return {
			todayStartMs,
			upcomingDays,
			pastDays: [] as CalendarDay[],
			unscheduled,
		};
	}, [filteredUmbrellas, filterType, appState?.markets, now]);

	/**
	 * Pin the home dock onto the umbrella the user is about to navigate into.
	 * Whenever they come back to the home page (browser-back, header click,
	 * etc.) `HomeInlineTradeLayout` lazy-init reads these keys so the trade
	 * widget keeps showing the same umbrella + market instead of snapping
	 * back to the top of the list.
	 *
	 * Kept in sync with the keys defined in `HomeInlineTradeLayout.tsx`.
	 */
	const pinHomeDockForUmbrella = (umbrellaId: string, marketId: string | null) => {
		try {
			localStorage.setItem("homeDockPinnedUmbrellaId", umbrellaId);
			if (marketId) {
				localStorage.setItem("homeDockActiveMarketId", marketId);
			} else {
				localStorage.removeItem("homeDockActiveMarketId");
			}
		} catch {
			/* localStorage unavailable — silently no-op */
		}
	};

	// Navigation functions
	const navigateToUmbrella = (umbrella: Umbrella) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		// Generic card click: always open full umbrella/trading route (same as other
		// list modes). Inline home dock is updated via odds-button clicks (`onHomeOddsSelect`)
		// — not via the card chrome.
		pinHomeDockForUmbrella(umbrella._id, null);
		saveHomeCatalogScroll();
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const navigateToSingleMarket = (umbrella: Umbrella, position: "yes" | "no") => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		const question = resolveHomeMatchWinnerQuestion(umbrella, {
			singleMarketQuestions,
			multiMarketData,
		});
		if (question) {
			localStorage.setItem("currentPredictionMarket", JSON.stringify(question));
			localStorage.setItem("activePosition", position);
		}
		const qid = question
			? question._id || (question as any).questionId || (question as any).marketId || null
			: null;
		pinHomeDockForUmbrella(umbrella._id, qid);
		saveHomeCatalogScroll();
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const navigateToMultiMarket = (
		umbrella: Umbrella,
		question: PredictionMarket,
		position: "yes" | "no",
	) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		localStorage.setItem("currentPredictionMarket", JSON.stringify(question));
		localStorage.setItem("activePosition", position);

		// Store the selected market ID so it becomes the active market on the trading page
		const marketId = question._id || question.questionId || question.marketId;
		if (marketId) {
			localStorage.setItem("selectedMarketId", marketId);
		}
		pinHomeDockForUmbrella(umbrella._id, marketId ?? null);

		saveHomeCatalogScroll();
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const shouldUseCalendar = filterType === "esports" || filterType === "all";
	const useCalendarLayout = shouldUseCalendar;

	const { subscribePandaMatchId, unsubscribePandaMatchId } = useVenuePandaSubscription();

	const visibleUmbrellasForVenueWs = useMemo(
		() =>
			collectVisibleUmbrellas(
				useCalendarLayout,
				useCalendarLayout ? calendarData : null,
				filteredUmbrellas,
			),
		[useCalendarLayout, calendarData, filteredUmbrellas],
	);

	const visiblePandaIdsForVenueWs = useMemo(() => {
		const out: string[] = [];
		const seen = new Set<string>();
		for (const u of visibleUmbrellasForVenueWs) {
			const raw = (u as { pandascore_matchId?: unknown }).pandascore_matchId;
			const pid = typeof raw === "string" ? raw.trim() : "";
			if (!pid) continue;
			// Subscribe series + each map wire key so per-map odds stream, not just series.
			const children = (u as { children?: unknown }).children;
			const keys = pandaVenueWireKeys(
				pid,
				Array.isArray(children)
					? (children as unknown as Parameters<typeof pandaVenueWireKeys>[1])
					: [],
			);
			const wireKeys = keys.length > 0 ? keys : [pid];
			for (const k of wireKeys) {
				if (seen.has(k)) continue;
				seen.add(k);
				out.push(k);
			}
		}
		return out;
	}, [visibleUmbrellasForVenueWs]);

	useEffect(() => {
		for (const id of visiblePandaIdsForVenueWs) subscribePandaMatchId(id);
		return () => {
			for (const id of visiblePandaIdsForVenueWs) unsubscribePandaMatchId(id);
		};
	}, [visiblePandaIdsForVenueWs, subscribePandaMatchId, unsubscribePandaMatchId]);

	const handleRetry = () => {
		window.location.reload();
	};

	const renderPredictionCard = (umbrella: Umbrella) => (
		<PredictionCard
			key={umbrella._id}
			umbrella={umbrella}
			singleMarketOrderbooks={singleMarketOrderbooks}
			singleMarketQuestions={singleMarketQuestions}
			multiMarketData={multiMarketData}
			onNavigateToUmbrella={navigateToUmbrella}
			onNavigateToSingleMarket={navigateToSingleMarket}
			onNavigateToMultiMarket={navigateToMultiMarket}
		/>
	);

	if (error) {
		return <LoadingState error={error} onRetry={handleRetry} />;
	}

	/*
	 * Keep the skeleton up until BOTH umbrellas and tags are ready. Previously
	 * we only gated on `loading` (umbrellas), which let the cards paint while
	 * `GameLinks` was still returning `null` for `tagsLoading=true` — the user
	 * saw cards appear first, then the left sidebar pop in. Holding the
	 * skeleton until both finish loading makes the layout settle in one beat.
	 */
	if (loading || tagsLoading) {
		return <HomeSkeleton filterType={filterType} />;
	}

	const pageTitle =
		filterType === "esports" ? "Esports" : filterType === "games" ? "Games" : "Markets";
	const noMarketsMessage =
		filterType === "esports"
			? "No current esports markets"
			: filterType === "games"
				? "No current games markets"
				: "No current markets";

	let content: ReactNode = null;

	if (useCalendarLayout && calendarData) {
		const hasUpcoming = calendarData.upcomingDays.length > 0;
		const hasUnscheduled = calendarData.unscheduled.length > 0;
		// Past events are intentionally dropped at the `calendarData` stage
		// (see comment there) — the home page never shows markets older
		// than today, so there's no "Recent Events" archive section.
		const hasAny = hasUpcoming || hasUnscheduled;

		if (!hasAny) {
			content = (
				<div className="no-markets-message no-markets-message--empty">
					<p>
						{(() => {
							const label = gameFilterDisplayLabel(selectedGame);
							return label
								? `No current ${pageTitle.toLowerCase()} markets for ${label}`
								: noMarketsMessage;
						})()}
					</p>
				</div>
			);
		} else {
			let calendarOddsPickerShown = false;
			const calendarSections: ReactNode[] = [];

			for (const day of calendarData.upcomingDays) {
				const eventsToShow = day.events;

				const label = formatDayLabel(day.date, calendarData.todayStartMs);
				const showOddsPicker = !calendarOddsPickerShown;
				if (showOddsPicker) calendarOddsPickerShown = true;
				calendarSections.push(
					<section key={`upcoming-${buildDayKey(day.date)}`} className="prediction-calendar-day">
						<header className="prediction-calendar-header">
							<div className="prediction-calendar-title">
								<span className="prediction-calendar-primary">{label.primary}</span>
								<span className="prediction-calendar-secondary">{label.secondary}</span>
							</div>
							{showOddsPicker ? <PredictionsCalendarOddsPicker /> : null}
						</header>
						<div className="predictions-grid prediction-calendar-grid">
							{eventsToShow.map((event) => renderPredictionCard(event.umbrella))}
						</div>
					</section>,
				);
			}

			if (hasUnscheduled) {
				const unscheduledToShow = calendarData.unscheduled;

				const showOddsPicker = !calendarOddsPickerShown;
				if (showOddsPicker) calendarOddsPickerShown = true;
				calendarSections.push(
					<section
						key="unscheduled"
						className="prediction-calendar-day prediction-calendar-day--unscheduled"
					>
						<header className="prediction-calendar-header">
							<div className="prediction-calendar-title">
								<span className="prediction-calendar-primary">To Be Scheduled</span>
								<span className="prediction-calendar-secondary">Event date not provided</span>
							</div>
							{showOddsPicker ? <PredictionsCalendarOddsPicker /> : null}
						</header>
						<div className="predictions-grid prediction-calendar-grid">
							{unscheduledToShow.map((umbrellaItem) => renderPredictionCard(umbrellaItem))}
						</div>
					</section>,
				);
			}

			content = (
				<div className="prediction-calendar">
					<PredictionPageHeading selectedGame={selectedGame} />
					{calendarSections}
				</div>
			);
		}
	} else {
		const gridClassName =
			filterType === "esports" ? "predictions-grid predictions-grid--carousel" : "predictions-grid";
		const showGamePageHeading = isSpecificGameTagSelection(selectedGame);

		const grid = (
			<div className={gridClassName}>
				{filteredUmbrellas.length > 0 ? (
					<>
						{filteredUmbrellas.map((umbrella) => renderPredictionCard(umbrella))}
						{filterType === "esports" && (
							<div
								className="view-all-card-filtered"
								onClick={() => {
									window.scrollTo({ top: 0, behavior: "smooth" });
								}}
							>
								<div className="view-all-card-content">
									<svg
										className="view-all-card-icon"
										width="48"
										height="48"
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M5 12H19M19 12L12 5M19 12L12 19"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
									<h3 className="view-all-card-title">See All Esports</h3>
									<p className="view-all-card-count">{filteredUmbrellas.length} markets</p>
								</div>
							</div>
						)}
					</>
				) : (
					<div className="no-markets-message no-markets-message--empty">
						<p>
							{(() => {
								const label = gameFilterDisplayLabel(selectedGame);
								return label
									? `No current ${pageTitle.toLowerCase()} markets for ${label}`
									: noMarketsMessage;
							})()}
						</p>
					</div>
				)}
			</div>
		);

		content = showGamePageHeading ? (
			<div className="prediction-calendar">
				<PredictionPageHeading selectedGame={selectedGame} />
				{grid}
			</div>
		) : (
			grid
		);
	}

	const marketBgUrl = resolveMarketBackgroundUrl(selectedGame);

	return (
		<div className="predictions-page predictions-page--market-bg page-layout">
			<div className="predictions-page__market-background" aria-hidden>
				<div
					className="predictions-page__market-background-photo"
					style={{ backgroundImage: `url(${marketBgUrl})` }}
				/>
			</div>
			<div className="predictions-page__body predictions-markets-body">
				<GameLinks
					selectedGame={selectedGame}
					onGameSelect={setSelectedGame}
					umbrellas={umbrellas}
					loading={loading}
					filterType={filterType}
				/>
				<HomeInlineTradeLayout
					enabled={filterType === "all"}
					visibleUmbrellas={visibleUmbrellasForVenueWs}
					selectedGame={selectedGame}
				>
					<div className="predictions-page__main">{content}</div>
				</HomeInlineTradeLayout>
			</div>
		</div>
	);
}
