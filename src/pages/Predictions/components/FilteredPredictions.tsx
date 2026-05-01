import React, {
	useState,
	useEffect,
	useLayoutEffect,
	useRef,
	useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { useSignerContext } from "context/SignerContext";
import { PredictionCard } from "./PredictionCard";
import { LoadingState } from "./LoadingState";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import "../Predictions.scss";
import GameLinks from "./GameLinks";
import { HomeInlineTradeLayout } from "./HomeInlineTradeLayout";
import PredictionsCalendarOddsPicker from "./PredictionsCalendarOddsPicker";
import {
	resolveUmbrellaEventDate,
	startOfLocalDay,
} from "../utils/eventDates";
import {
	MAX_VENUE_PANDA_SUBSCRIPTIONS,
	useVenuePandaSubscription,
} from "@/context/VenuePandaSubscriptionContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import {
	getListingYesNoPricesForUmbrella,
	isDeemphasizedSettledLeanOdds,
} from "@/helpers/predictionUtils";
import {
	GAME_FILTER_COMPACT_MEDIA,
	gameFilterResetSelection,
	isUmbrellaLiveByEventDate,
	isUmbrellaStartingSoonByEventDate,
	LIVE_PILL_ID,
	normalizeTagLabel,
	STARTING_SOON_PILL_ID,
	useNowTick,
} from "../utils/gameLinkFilters";

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
	todayStartMs: number
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

const INITIAL_VISIBLE = 20;
const LOAD_MORE_COUNT = 20;

type CalendarDataForVisibility = {
	upcomingDays: { events: CalendarEvent[] }[];
	unscheduled: Umbrella[];
	pastDays: { events: CalendarEvent[] }[];
};

/** Same umbrella ordering as rendered cards (calendar vs flat grid), capped by `visibleCount`. */
function collectVisibleUmbrellas(
	shouldUseCalendar: boolean,
	calendarData: CalendarDataForVisibility | null,
	filteredUmbrellas: Umbrella[],
	visibleCount: number,
): Umbrella[] {
	if (!shouldUseCalendar || !calendarData) {
		return filteredUmbrellas.slice(0, visibleCount);
	}
	const out: Umbrella[] = [];
	let rendered = 0;
	for (const day of calendarData.upcomingDays) {
		if (rendered >= visibleCount) break;
		const remaining = visibleCount - rendered;
		const slice = day.events.slice(0, remaining);
		for (const e of slice) out.push(e.umbrella);
		rendered += slice.length;
	}
	if (rendered < visibleCount && calendarData.unscheduled.length) {
		const remaining = visibleCount - rendered;
		out.push(...calendarData.unscheduled.slice(0, remaining));
		rendered += Math.min(remaining, calendarData.unscheduled.length);
	}
	if (rendered < visibleCount && calendarData.pastDays.length) {
		for (const day of calendarData.pastDays) {
			if (rendered >= visibleCount) break;
			const remaining = visibleCount - rendered;
			const slice = day.events.slice(0, remaining);
			for (const e of slice) out.push(e.umbrella);
			rendered += slice.length;
		}
	}
	return out;
}

function gameFilterDisplayLabel(selectedGame: string | null): string | null {
	if (!selectedGame) return null;
	if (selectedGame === LIVE_PILL_ID) return "Live";
	if (selectedGame === STARTING_SOON_PILL_ID) return "Starting Soon";
	return selectedGame;
}

export default function FilteredPredictions({
	filterType,
}: FilteredPredictionsProps) {
	const navigate = useNavigate();
	const { authenticated } = useSignerContext();
	const [selectedGame, setSelectedGame] = useState<string | null>(null);
	const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const mq = window.matchMedia(GAME_FILTER_COMPACT_MEDIA);
		if (!mq.matches) return;
		setSelectedGame((prev) => (prev === null ? LIVE_PILL_ID : prev));
	}, []);

	// Reset visible count when filters change
	useEffect(() => {
		setVisibleCount(INITIAL_VISIBLE);
	}, [selectedGame, filterType]);

	// IntersectionObserver to load more cards on scroll
	const loadMore = useCallback(() => {
		setVisibleCount((prev) => prev + LOAD_MORE_COUNT);
	}, []);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) loadMore();
			},
			{ rootMargin: "400px" }
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [loadMore]);

	// Listen for reset filter event from header
	useEffect(() => {
		const handleResetFilter = () => {
			setSelectedGame(gameFilterResetSelection());
		};

		window.addEventListener("resetGameFilter", handleResetFilter);
		return () => {
			window.removeEventListener("resetGameFilter", handleResetFilter);
		};
	}, []);

	const {
		umbrellas,
		loading,
		error,
		singleMarketOrderbooks,
		singleMarketQuestions,
		multiMarketData,
		tags,
	} = usePredictionData();

	const { appState } = useOddsMonitor();
	const now = useNowTick(60_000);

	const filteredUmbrellas = React.useMemo(() => {
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			return (umbrella as any).active === true;
		});

		const esportsTag = tags.find(
			(t) => normalizeTagLabel(t.label) === "ESPORTS",
		);
		const esportsTagId = esportsTag?._id;

		let filtered = activeUmbrellas.filter((umbrella) => {
			const children = (umbrella as any).children as
				| Array<any>
				| undefined;
			if (!children || children.length === 0) return false;

			const hasEsportsTag = children.some((q) => {
				const tagIds: string[] | undefined = (q &&
					(q as any).tagIds) as any;
				if (!Array.isArray(tagIds) || tagIds.length === 0) {
					return false;
				}
				return esportsTag && tagIds.includes(esportsTag._id);
			});

			if (filterType === "all") {
				return true;
			}
			if (filterType === "esports") {
				return hasEsportsTag;
			}
			return !hasEsportsTag;
		});

		if (
			selectedGame &&
			selectedGame !== LIVE_PILL_ID &&
			selectedGame !== STARTING_SOON_PILL_ID
		) {
			const selectedTag = tags.find((t) => t.label === selectedGame);
			if (selectedTag) {
				filtered = filtered.filter((umbrella) => {
					const children = (umbrella as any).children as
						| Array<any>
						| undefined;
					if (!children || children.length === 0) return false;

					return children.some((q) => {
						const tagIds: string[] | undefined = (q &&
							(q as any).tagIds) as any;
						if (!Array.isArray(tagIds) || tagIds.length === 0) {
							return false;
						}
						return tagIds.includes(selectedTag._id);
					});
				});
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

		if (filterType === "games") {
			return sortByTradingActivity(filtered);
		}

		return filtered;
	}, [umbrellas, filterType, selectedGame, tags, now]);

	const calendarData = React.useMemo(() => {
		if (filterType === "games") {
			return null;
		}

		const todayStart = startOfLocalDay(new Date());
		const todayStartMs = todayStart.getTime();

		type CalendarDay = { date: Date; events: CalendarEvent[] };

		const upcomingMap = new Map<string, CalendarDay>();
		const pastMap = new Map<string, CalendarDay>();
		const unscheduled: Umbrella[] = [];

		for (let index = 0; index < filteredUmbrellas.length; index += 1) {
			const umbrella = filteredUmbrellas[index];
			const eventDate = resolveUmbrellaEventDate(umbrella);
			if (eventDate === null) {
				unscheduled.push(umbrella);
				continue;
			}

			const dayStart = startOfLocalDay(eventDate);
			const key = buildDayKey(dayStart);
			const event: CalendarEvent = {
				umbrella,
				eventDate,
			};

			const dayStartMs = dayStart.getTime();
			if (dayStartMs >= todayStartMs) {
				let day = upcomingMap.get(key);
				if (!day) {
					day = { date: dayStart, events: [] };
					upcomingMap.set(key, day);
				}
				day.events.push(event);
			} else {
				let day = pastMap.get(key);
				if (!day) {
					day = { date: dayStart, events: [] };
					pastMap.set(key, day);
				}
				day.events.push(event);
			}
		}

		const sortByDate = (a: CalendarDay, b: CalendarDay) =>
			a.date.getTime() - b.date.getTime();
		const sortByDateDesc = (a: CalendarDay, b: CalendarDay) =>
			b.date.getTime() - a.date.getTime();

		const scoreDead = (umbrella: Umbrella): number => {
			const { yes, no } = getListingYesNoPricesForUmbrella(
				umbrella,
				appState?.markets,
			);
			return isDeemphasizedSettledLeanOdds(yes, no) ? 1 : 0;
		};

		const upcomingDays = Array.from(upcomingMap.values())
			.sort(sortByDate)
			.map((day) => {
				sortCalendarEventsByPlayOrder(day.events, now, scoreDead);
				return day;
			});

		const pastDays = Array.from(pastMap.values())
			.sort(sortByDateDesc)
			.map((day) => {
				sortCalendarEventsByPlayOrder(day.events, now, scoreDead);
				return day;
			});

		return {
			todayStartMs,
			upcomingDays,
			pastDays,
			unscheduled,
		};
	}, [filteredUmbrellas, filterType, appState?.markets, now]);

	// Navigation functions
	const navigateToUmbrella = (umbrella: Umbrella) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const navigateToSingleMarket = (
		umbrella: Umbrella,
		position: "yes" | "no"
	) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		const question = singleMarketQuestions[umbrella._id];
		if (question) {
			localStorage.setItem(
				"currentPredictionMarket",
				JSON.stringify(question)
			);
			localStorage.setItem("activePosition", position);
		}
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const navigateToMultiMarket = (
		umbrella: Umbrella,
		question: PredictionMarket,
		position: "yes" | "no"
	) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		localStorage.setItem(
			"currentPredictionMarket",
			JSON.stringify(question)
		);
		localStorage.setItem("activePosition", position);

		// Store the selected market ID so it becomes the active market on the trading page
		const marketId =
			question._id || question.questionId || question.marketId;
		if (marketId) {
			localStorage.setItem("selectedMarketId", marketId);
		}

		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	// Compute total event count for calendar (must be before early return to satisfy Rules of Hooks)
	const calendarTotalCount = React.useMemo(() => {
		if (!calendarData) return 0;
		let count = 0;
		for (const day of calendarData.upcomingDays) count += day.events.length;
		count += calendarData.unscheduled.length;
		for (const day of calendarData.pastDays) count += day.events.length;
		return count;
	}, [calendarData]);

	const shouldUseCalendar = filterType === "esports" || filterType === "all";
	const { subscribePandaMatchId, unsubscribePandaMatchId } =
		useVenuePandaSubscription();

	const visibleUmbrellasForVenueWs = React.useMemo(
		() =>
			collectVisibleUmbrellas(
				shouldUseCalendar,
				shouldUseCalendar ? calendarData : null,
				filteredUmbrellas,
				visibleCount,
			),
		[
			shouldUseCalendar,
			calendarData,
			filteredUmbrellas,
			visibleCount,
		],
	);

	const visiblePandaIdsForVenueWs = React.useMemo(() => {
		const out: string[] = [];
		const seen = new Set<string>();
		for (const u of visibleUmbrellasForVenueWs) {
			const raw = (u as { pandascore_matchId?: unknown }).pandascore_matchId;
			const pid = typeof raw === "string" ? raw.trim() : "";
			if (!pid || seen.has(pid)) continue;
			seen.add(pid);
			out.push(pid);
			if (out.length >= MAX_VENUE_PANDA_SUBSCRIPTIONS) break;
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

	if (loading || error) {
		return <LoadingState error={error || null} onRetry={handleRetry} />;
	}

	const pageTitle =
		filterType === "esports"
			? "Esports"
			: filterType === "games"
				? "Games"
				: "Markets";
	const noMarketsMessage =
		filterType === "esports"
			? "No current esports markets"
			: filterType === "games"
				? "No current games markets"
				: "No current markets";

	let content: React.ReactNode = null;

	const hasMoreItems = shouldUseCalendar
		? visibleCount < calendarTotalCount
		: visibleCount < filteredUmbrellas.length;

	if (shouldUseCalendar && calendarData) {
		const hasUpcoming = calendarData.upcomingDays.length > 0;
		const hasPast = calendarData.pastDays.length > 0;
		const hasUnscheduled = calendarData.unscheduled.length > 0;
		const hasAny = hasUpcoming || hasPast || hasUnscheduled;

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
			// Progressive rendering: only render up to visibleCount cards across all day groups
			let rendered = 0;
			let calendarOddsPickerShown = false;
			const calendarSections: React.ReactNode[] = [];

			for (const day of calendarData.upcomingDays) {
				if (rendered >= visibleCount) break;
				const remaining = visibleCount - rendered;
				const eventsToShow = day.events.slice(0, remaining);
				rendered += eventsToShow.length;

				const label = formatDayLabel(day.date, calendarData.todayStartMs);
				const showOddsPicker = !calendarOddsPickerShown;
				if (showOddsPicker) calendarOddsPickerShown = true;
				calendarSections.push(
					<section
						key={`upcoming-${buildDayKey(day.date)}`}
						className="prediction-calendar-day"
					>
						<header className="prediction-calendar-header">
							<div className="prediction-calendar-title">
								<span className="prediction-calendar-primary">
									{label.primary}
								</span>
								<span className="prediction-calendar-secondary">
									{label.secondary}
								</span>
							</div>
							{showOddsPicker ? <PredictionsCalendarOddsPicker /> : null}
						</header>
						<div className="predictions-grid prediction-calendar-grid">
							{eventsToShow.map((event) =>
								renderPredictionCard(event.umbrella)
							)}
						</div>
					</section>
				);
			}

			if (rendered < visibleCount && hasUnscheduled) {
				const remaining = visibleCount - rendered;
				const unscheduledToShow = calendarData.unscheduled.slice(0, remaining);
				rendered += unscheduledToShow.length;

				const showOddsPicker = !calendarOddsPickerShown;
				if (showOddsPicker) calendarOddsPickerShown = true;
				calendarSections.push(
					<section
						key="unscheduled"
						className="prediction-calendar-day prediction-calendar-day--unscheduled"
					>
						<header className="prediction-calendar-header">
							<div className="prediction-calendar-title">
								<span className="prediction-calendar-primary">
									To Be Scheduled
								</span>
								<span className="prediction-calendar-secondary">
									Event date not provided
								</span>
							</div>
							{showOddsPicker ? <PredictionsCalendarOddsPicker /> : null}
						</header>
						<div className="predictions-grid prediction-calendar-grid">
							{unscheduledToShow.map((umbrellaItem) =>
								renderPredictionCard(umbrellaItem)
							)}
						</div>
					</section>
				);
			}

			if (rendered < visibleCount && hasPast) {
				const pastSections: React.ReactNode[] = [];
				for (const day of calendarData.pastDays) {
					if (rendered >= visibleCount) break;
					const remaining = visibleCount - rendered;
					const eventsToShow = day.events.slice(0, remaining);
					rendered += eventsToShow.length;

					const label = formatDayLabel(day.date, calendarData.todayStartMs);
					const showOddsPicker = !calendarOddsPickerShown;
					if (showOddsPicker) calendarOddsPickerShown = true;
					pastSections.push(
						<section
							key={`past-${buildDayKey(day.date)}`}
							className="prediction-calendar-day prediction-calendar-day--past"
						>
							<header className="prediction-calendar-header">
								<div className="prediction-calendar-title">
									<span className="prediction-calendar-primary">
										{label.primary}
									</span>
									<span className="prediction-calendar-secondary">
										{label.secondary}
									</span>
								</div>
								{showOddsPicker ? <PredictionsCalendarOddsPicker /> : null}
							</header>
							<div className="predictions-grid prediction-calendar-grid">
								{eventsToShow.map((event) =>
									renderPredictionCard(event.umbrella)
								)}
							</div>
						</section>
					);
				}
				if (pastSections.length > 0) {
					calendarSections.push(
						<section key="past-archive" className="prediction-calendar-archive">
							<h3 className="prediction-calendar-archive-title">
								Recent Events
							</h3>
							{pastSections}
						</section>
					);
				}
			}

			content = (
				<div className="prediction-calendar">
					{calendarSections}
				</div>
			);
		}
	} else {
		const gridClassName =
			filterType === "esports"
				? "predictions-grid predictions-grid--carousel"
				: "predictions-grid";

		const visibleUmbrellas = filteredUmbrellas.slice(0, visibleCount);

		content = (
			<div className={gridClassName}>
				{visibleUmbrellas.length > 0 ? (
					<>
						{visibleUmbrellas.map((umbrella) =>
							renderPredictionCard(umbrella)
						)}
						{filterType === "esports" && !hasMoreItems && (
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
									<h3 className="view-all-card-title">
										See All Esports
									</h3>
									<p className="view-all-card-count">
										{filteredUmbrellas.length} markets
									</p>
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
	}

	return (
		<div className="predictions-page page-layout">
			<div className="predictions-page__body">
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
					<div className="predictions-page__main">
						{content}
						{hasMoreItems && (
							<div
								ref={sentinelRef}
								style={{ height: 1, width: "100%" }}
								aria-hidden
							/>
						)}
					</div>
				</HomeInlineTradeLayout>
			</div>
		</div>
	);
}
