import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import {
	getListingYesNoPricesForUmbrella,
	isDeemphasizedSettledLeanOdds,
	umbrellaHasListableCrossVenueOdds,
} from "@/features/markets/listing/umbrellaListingOdds";
import {
	findEsportsTag,
	gameFilterResetSelection,
	isEsportsMetaTagLabel,
	isUmbrellaLiveByEventDate,
	isUmbrellaStartingSoonByEventDate,
	isMlbUmbrella,
	isWorldCupUmbrella,
	LIVE_PILL_ID,
	STARTING_SOON_PILL_ID,
	umbrellaHasTradeableHomeChildren,
	umbrellaMatchesHomeFilterType,
	worldCupPropGroupSortKey,
	worldCupMultiLegSortKey,
	WORLD_CUP_PILL_ID,
	useNowTick,
} from "../utils/gameLinkFilters";
import {
	isNonMatchHomeListing,
	worldCupSectionForUmbrella,
} from "@/features/markets/listing/multiLegMarket";
import {
	clearHomePendingGameFilter,
	clearHomePendingWorldCupSection,
	getHomeGameFilter,
	peekHomePendingGameFilter,
	peekHomePendingWorldCupSection,
	setHomeGameFilter,
} from "../utils/gameFilterNavigation";
import type { WorldCupSection } from "./GameLinks";
import { isRestrictedProductionMode } from "@/config/restrictedMode";
import { isCounterStrikeUmbrella } from "@/features/markets/presentation/umbrellaGame";
import { resolveMarketBackgroundUrl } from "../utils/marketBackgrounds";
import {
	bundledCounterStrikeLogoFromTagLabels,
	resolveLogoByTags,
	WORLD_CUP_GAME_LOGO_URL,
} from "@/features/markets/assets/gameLogoResolver";
import { preloadPredictionMarketRoute } from "@/app/routes/predictionMarketRouteLazy";
import { VirtualizedHomeCards } from "./VirtualizedHomeCards";

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
	sortByGroupLetter: boolean,
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

		if (sortByGroupLetter) {
			const gL = worldCupPropGroupSortKey(left.umbrella);
			const gR = worldCupPropGroupSortKey(right.umbrella);
			const gCmp = gL.localeCompare(gR);
			if (gCmp !== 0) return gCmp;
		}

		return leftMs - rightMs;
	});
}

// Sort umbrellas by trading activity (number of trades across all children markets)
function umbrellaPandascoreMatchId(umbrella: Umbrella): string {
	const raw = (umbrella as { pandascore_matchId?: unknown }).pandascore_matchId;
	return typeof raw === "string" ? raw.trim() : "";
}

/** Prefer the listing with more cross-venue volume when two umbrellas share a Panda match. */
function umbrellaHomeListingScore(umbrella: Umbrella): number {
	const totalUsd = (umbrella as { volume?: { totalUsd?: unknown } }).volume?.totalUsd;
	if (typeof totalUsd === "number" && Number.isFinite(totalUsd)) {
		return totalUsd;
	}
	const children = (umbrella as { children?: Array<{ tradeCount?: number }> }).children;
	if (!children?.length) return 0;
	return children.reduce((sum, child) => sum + (child?.tradeCount ?? 0), 0);
}

/**
 * One home card per Panda match — duplicate umbrellas (same `pandascore_matchId`)
 * keep the higher-volume listing.
 */
function dedupeUmbrellasByPandascoreMatch(umbrellas: Umbrella[]): Umbrella[] {
	const winnerByPanda = new Map<string, Umbrella>();

	for (const umbrella of umbrellas) {
		const pandaId = umbrellaPandascoreMatchId(umbrella);
		if (!pandaId) continue;
		const existing = winnerByPanda.get(pandaId);
		if (!existing || umbrellaHomeListingScore(umbrella) > umbrellaHomeListingScore(existing)) {
			winnerByPanda.set(pandaId, umbrella);
		}
	}

	const emittedPanda = new Set<string>();
	const out: Umbrella[] = [];

	for (const umbrella of umbrellas) {
		const pandaId = umbrellaPandascoreMatchId(umbrella);
		if (!pandaId) {
			out.push(umbrella);
			continue;
		}
		if (emittedPanda.has(pandaId)) continue;
		const winner = winnerByPanda.get(pandaId);
		if (winner) out.push(winner);
		emittedPanda.add(pandaId);
	}

	return out;
}

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
	nonMatchMarkets: Umbrella[];
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
	out.push(...calendarData.nonMatchMarkets);
	out.push(...calendarData.unscheduled);
	return out;
}

const DEFAULT_CALENDAR_PAGE_TITLE = "Trade Across 5 Prediction Markets";

function gameFilterDisplayLabel(selectedGame: string | null): string | null {
	if (!selectedGame) return null;
	if (selectedGame === LIVE_PILL_ID) return "Live";
	if (selectedGame === STARTING_SOON_PILL_ID) return "Starting Soon";
	if (selectedGame === WORLD_CUP_PILL_ID) return "World Cup";
	if (isEsportsMetaTagLabel(selectedGame)) return "All";
	return selectedGame;
}

function calendarPageHeadingTitle(
	selectedGame: string | null,
	worldCupSection: WorldCupSection,
): string {
	if (selectedGame === LIVE_PILL_ID) return "Live";
	if (selectedGame === STARTING_SOON_PILL_ID) return "Starting Soon";
	if (selectedGame === WORLD_CUP_PILL_ID) {
		if (worldCupSection === "games") return "Games - World Cup";
		if (worldCupSection === "groups") return "Groups - World Cup";
		if (worldCupSection === "futures") return "Futures - World Cup";
		return "Awards - World Cup";
	}
	if (!selectedGame || isEsportsMetaTagLabel(selectedGame)) {
		return DEFAULT_CALENDAR_PAGE_TITLE;
	}
	return gameFilterDisplayLabel(selectedGame) ?? selectedGame;
}

export default function FilteredPredictions({ filterType }: FilteredPredictionsProps) {
	const navigate = useNavigate();
	/*
	 * Initial filter resolution (runs before first paint, no side effects):
	 *   1. `homePendingGameFilter` — one-shot signal written by the trading
	 *      page's left-sidebar handler when the user clicks back to a list.
	 *   2. `homeGameFilter` — sticky persistence of the user's last picked
	 *      filter on the home page itself.
	 *   3. `null` — fall through to the first-load default tag effect below.
	 *
	 * We use `peek*` (read-only) instead of `consume*` (read + remove) here
	 * because React 18 Strict Mode mounts components twice in dev: a
	 * `consume*` call in either `useState`'s initializer or an effect would
	 * be reached twice, but only the first call sees the pending value —
	 * the second falls through to the default and overwrites the user's
	 * chosen list. Cleanup of the pending key happens in a dedicated mount
	 * effect (idempotent — second run is a no-op).
	 */
	const [selectedGame, setSelectedGame] = useState<string | null>(
		() => peekHomePendingGameFilter() ?? getHomeGameFilter(),
	);
	const [defaultTagApplied, setDefaultTagApplied] = useState<boolean>(
		() => peekHomePendingGameFilter() !== null || getHomeGameFilter() !== null,
	);
	/** World Cup sub-section: moneyline matches ("games") vs group-winner ("groups"). */
	const [worldCupSection, setWorldCupSection] = useState<WorldCupSection>(
		() => peekHomePendingWorldCupSection() ?? "games",
	);

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

	useEffect(() => {
		setHomeGameFilter(selectedGame);
	}, [selectedGame]);

	/*
	 * Clear the one-shot pending filter once mount is committed. Idempotent
	 * across Strict Mode's double-mount: each mount's effect run is a plain
	 * `removeItem` — a no-op if the key is already absent. State has already
	 * been initialized from `peek*` so the pending value is preserved.
	 */
	useEffect(() => {
		clearHomePendingGameFilter();
		clearHomePendingWorldCupSection();
	}, []);

	// First-load default: only applies when neither a pending filter nor a
	// persisted filter was found (both gated via `defaultTagApplied`). Cascades:
	//   1. LIVE if any active umbrella is currently live
	//   2. else STARTING SOON if any is starting soon
	//   3. else null (no pill selected → show everything for the current filter type)
	// Evaluated once after umbrellas + tags finish loading; if neither pill has
	// content right now we don't oscillate as time passes.
	useEffect(() => {
		if (tagsLoading || loading) return;
		if (defaultTagApplied) return;
		const esportsTagId = findEsportsTag(tags)?._id;
		const now = Date.now();
		const activeUmbrellas = umbrellas.filter((u) => (u as { active?: boolean }).active === true);
		const hasLive = activeUmbrellas.some((u) => isUmbrellaLiveByEventDate(u, now, esportsTagId));
		if (hasLive) {
			setSelectedGame(LIVE_PILL_ID);
			setDefaultTagApplied(true);
			return;
		}
		const hasStartingSoon = activeUmbrellas.some((u) =>
			isUmbrellaStartingSoonByEventDate(u, now, esportsTagId),
		);
		if (hasStartingSoon) {
			setSelectedGame(STARTING_SOON_PILL_ID);
			setDefaultTagApplied(true);
			return;
		}
		setSelectedGame(null);
		setDefaultTagApplied(true);
	}, [tagsLoading, loading, tags, umbrellas, defaultTagApplied]);

	const handleWorldCupSectionSelect = (section: WorldCupSection) => {
		setSelectedGame(WORLD_CUP_PILL_ID);
		setWorldCupSection(section);
	};

	// Prefetch umbrella trading route chunk so card clicks are not blocked on Suspense.
	useEffect(() => {
		preloadPredictionMarketRoute();
	}, []);

	// Listen for reset filter event from header
	useEffect(() => {
		const handleResetFilter = () => {
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
			if (isMlbUmbrella(umbrella)) return false;
			// Restricted production mode: hide every non-Counter-Strike
			// umbrella from the public home list. Applied BEFORE the
			// active-flag check so the count of esports-with-active-bets
			// also reflects only CS2.
			if (restrictedMode && !isCounterStrikeUmbrella(umbrella as any)) {
				return false;
			}
			return (umbrella as any).active === true;
		});

		const esportsTag = findEsportsTag(tags);
		const esportsTagId = esportsTag?._id;

		const worldCupPillActive = selectedGame === WORLD_CUP_PILL_ID;

		let filtered = activeUmbrellas.filter((umbrella) => {
			if (!umbrellaHasTradeableHomeChildren(umbrella)) return false;
			if (!umbrellaHasListableCrossVenueOdds(umbrella, appState?.markets)) return false;
			const children = (umbrella as any).children as Array<any> | undefined;
			if (!children || children.length === 0) return false;

			if (worldCupPillActive) {
				if (!isWorldCupUmbrella(umbrella)) return false;
				const section = worldCupSectionForUmbrella(umbrella);
				if (worldCupSection === "games") return section === null;
				return section === worldCupSection;
			}

			return umbrellaMatchesHomeFilterType(umbrella, filterType, esportsTagId);
		});

		if (selectedGame && selectedGame !== LIVE_PILL_ID && selectedGame !== STARTING_SOON_PILL_ID) {
			const selectedTag = tags.find((t) => t.label === selectedGame);
			if (selectedTag && !isEsportsMetaTagLabel(selectedTag.label)) {
				filtered = filtered.filter((umbrella) => {
					const children = (umbrella as any).children as Array<any> | undefined;
					if (!children || children.length === 0) return false;

					return children.some((q) => {
						const tagIds: string[] | undefined = (q && (q as any).tagIds) as any;
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

		const deduped = dedupeUmbrellasByPandascoreMatch(filtered);

		if (filterType === "games") {
			return sortByTradingActivity(deduped);
		}

		if (worldCupPillActive && worldCupSection === "groups") {
			return [...deduped].sort((a, b) =>
				worldCupPropGroupSortKey(a).localeCompare(worldCupPropGroupSortKey(b)),
			);
		}

		if (worldCupPillActive && (worldCupSection === "futures" || worldCupSection === "awards")) {
			return [...deduped].sort((a, b) =>
				worldCupMultiLegSortKey(a).localeCompare(worldCupMultiLegSortKey(b)),
			);
		}

		return deduped;
	}, [umbrellas, filterType, selectedGame, worldCupSection, tags, now, restrictedMode, appState?.markets]);

	/** Games vs Groups counts for the World Cup sidebar (active World Cup umbrellas only). */
	const worldCupSectionCounts = useMemo(() => {
		let games = 0;
		let groups = 0;
		let futures = 0;
		let awards = 0;
		for (const u of umbrellas) {
			if ((u as { active?: boolean }).active !== true) continue;
			if (!isWorldCupUmbrella(u)) continue;
			const section = worldCupSectionForUmbrella(u);
			if (section === "groups") groups += 1;
			else if (section === "futures") futures += 1;
			else if (section === "awards") awards += 1;
			else games += 1;
		}
		return { games, groups, futures, awards };
	}, [umbrellas]);

	const calendarData = useMemo(() => {
		if (filterType === "games") {
			return null;
		}

		const todayStart = startOfLocalDay(new Date());
		const todayStartMs = todayStart.getTime();

		type CalendarDay = { date: Date; events: CalendarEvent[] };

		const upcomingMap = new Map<string, CalendarDay>();
		const nonMatchMarkets: Umbrella[] = [];
		const unscheduled: Umbrella[] = [];

		/*
		 * Past events (those whose local-day starts before today) are
		 * intentionally dropped: the home page should never surface markets
		 * older than today. Skipping them here means every downstream
		 * consumer (`collectVisibleUmbrellas`, the
		 * calendar JSX, the venue-WS subscription list) automatically
		 * excludes past umbrellas without each having to filter again.
		 */
		const sortCalendarByGroup = selectedGame === WORLD_CUP_PILL_ID && worldCupSection === "groups";

		for (let index = 0; index < filteredUmbrellas.length; index += 1) {
			const umbrella = filteredUmbrellas[index];
			if (!umbrellaHasTradeableHomeChildren(umbrella)) continue;
			if (isNonMatchHomeListing(umbrella)) {
				nonMatchMarkets.push(umbrella);
				continue;
			}
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
				sortCalendarEventsByPlayOrder(day.events, now, scoreDead, sortCalendarByGroup);
				return day;
			})
			.filter((day) => day.events.length > 0);

		return {
			todayStartMs,
			upcomingDays,
			pastDays: [] as CalendarDay[],
			nonMatchMarkets: nonMatchMarkets.filter(umbrellaHasTradeableHomeChildren),
			unscheduled: unscheduled.filter(umbrellaHasTradeableHomeChildren),
		};
	}, [filteredUmbrellas, filterType, selectedGame, worldCupSection, appState?.markets, now]);

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
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const navigateToSingleMarket = (umbrella: Umbrella, position: "yes" | "no") => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		const question = singleMarketQuestions[umbrella._id];
		if (question) {
			localStorage.setItem("currentPredictionMarket", JSON.stringify(question));
			localStorage.setItem("activePosition", position);
		}
		const qid = question
			? question._id || (question as any).questionId || (question as any).marketId || null
			: null;
		pinHomeDockForUmbrella(umbrella._id, qid);
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

		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const isWorldCupNonMatchSection =
		selectedGame === WORLD_CUP_PILL_ID &&
		(worldCupSection === "groups" ||
			worldCupSection === "futures" ||
			worldCupSection === "awards");
	const shouldUseCalendar = filterType === "esports" || filterType === "all";

	/*
	 * Per-card viewport subscriptions (PredictionCard) claim WS budget as cards
	 * scroll into view — capped at MAX_VENUE_PANDA_SUBSCRIPTIONS (~50).
	 */
	const visibleUmbrellasForVenueWs = useMemo(
		() =>
			collectVisibleUmbrellas(
				shouldUseCalendar,
				shouldUseCalendar ? calendarData : null,
				filteredUmbrellas,
			),
		[shouldUseCalendar, calendarData, filteredUmbrellas],
	);

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

	if (shouldUseCalendar && calendarData) {
		const hasUpcoming = calendarData.upcomingDays.length > 0;
		const hasNonMatch = calendarData.nonMatchMarkets.length > 0;
		const hasUnscheduled = calendarData.unscheduled.length > 0;
		// Past events are intentionally dropped at the `calendarData` stage
		// (see comment there) — the home page never shows markets older
		// than today, so there's no "Recent Events" archive section.
		const hasAny = hasUpcoming || hasNonMatch || hasUnscheduled;

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
				if (eventsToShow.length === 0) continue;

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

			if (hasNonMatch) {
				const nonMatchToShow = calendarData.nonMatchMarkets;
				const showOddsPicker = !calendarOddsPickerShown;
				if (showOddsPicker) calendarOddsPickerShown = true;
				calendarSections.push(
					<section
						key="non-match"
						className={`prediction-calendar-day prediction-calendar-day--non-match${
							isWorldCupNonMatchSection ? " prediction-calendar-day--non-match-dedicated" : ""
						}`}
					>
						{isWorldCupNonMatchSection ? (
							showOddsPicker ? (
								<header className="prediction-calendar-header prediction-calendar-header--odds-only">
									<div className="prediction-calendar-title" aria-hidden="true" />
									<PredictionsCalendarOddsPicker />
								</header>
							) : null
						) : (
							<header className="prediction-calendar-header">
								<div className="prediction-calendar-title">
									<span className="prediction-calendar-primary">Props & Futures</span>
								</div>
								{showOddsPicker ? <PredictionsCalendarOddsPicker /> : null}
							</header>
						)}
						<div className="predictions-grid prediction-calendar-grid">
							{nonMatchToShow.map((umbrellaItem) => renderPredictionCard(umbrellaItem))}
						</div>
					</section>,
				);
			}

			if (hasUnscheduled) {
				const unscheduledToShow = calendarData.unscheduled;
				if (unscheduledToShow.length > 0) {
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
			}

			content = (
				<div className="prediction-calendar">
					<header className="prediction-calendar-page-heading">
						<div className="prediction-calendar-page-heading__title-row">
							{(() => {
								const calendarTitle = calendarPageHeadingTitle(selectedGame, worldCupSection);
								const showGameLogo =
									selectedGame &&
									!isEsportsMetaTagLabel(selectedGame) &&
									selectedGame !== LIVE_PILL_ID &&
									selectedGame !== STARTING_SOON_PILL_ID &&
									selectedGame !== WORLD_CUP_PILL_ID;
								const calendarLogo =
									selectedGame === WORLD_CUP_PILL_ID
										? WORLD_CUP_GAME_LOGO_URL
										: showGameLogo
											? (bundledCounterStrikeLogoFromTagLabels([selectedGame]) ??
												resolveLogoByTags([selectedGame]))
											: null;
								return (
									<>
										{calendarLogo ? (
											<img
												className="prediction-calendar-page-heading__game-logo"
												src={calendarLogo}
												alt=""
												width={40}
												height={40}
												decoding="async"
											/>
										) : null}
										<h2 className="prediction-calendar-page-heading__title">{calendarTitle}</h2>
									</>
								);
							})()}
						</div>
					</header>
					{calendarSections}
				</div>
			);
		}
	} else {
		const gridClassName =
			filterType === "esports" ? "predictions-grid predictions-grid--carousel" : "predictions-grid";

		content = (
			<div className={gridClassName}>
				{filteredUmbrellas.length > 0 ? (
					<>
						{filterType === "esports" ? (
							filteredUmbrellas.map((umbrella) => renderPredictionCard(umbrella))
						) : (
							<VirtualizedHomeCards
								umbrellas={filteredUmbrellas}
								renderCard={renderPredictionCard}
							/>
						)}
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
	}

	const marketBgUrl = resolveMarketBackgroundUrl(selectedGame, worldCupSection);

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
					worldCupSection={worldCupSection}
					onWorldCupSectionSelect={handleWorldCupSectionSelect}
					worldCupSectionCounts={worldCupSectionCounts}
				/>
				<HomeInlineTradeLayout
					enabled={filterType === "all"}
					visibleUmbrellas={visibleUmbrellasForVenueWs}
					selectedGame={selectedGame}
					worldCupSection={worldCupSection}
				>
					<div className="predictions-page__main">{content}</div>
				</HomeInlineTradeLayout>
			</div>
		</div>
	);
}
