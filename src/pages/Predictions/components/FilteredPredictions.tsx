import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { useSignerContext } from "context/SignerContext";
import { PredictionCard } from "./PredictionCard";
import { LoadingState } from "./LoadingState";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import "../Predictions.scss";
import GameLinks from "./GameLinks";
import {
	resolveUmbrellaEventDate,
	startOfLocalDay,
} from "../utils/eventDates";
import { PromotionBar } from "@/components/PromotionBar";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	return { primary, secondary };
}

interface FilteredPredictionsProps {
	filterType: "esports" | "games";
}

export default function FilteredPredictions({
	filterType,
}: FilteredPredictionsProps) {
	const navigate = useNavigate();
	const { authenticated } = useSignerContext();
	const [selectedGame, setSelectedGame] = useState<string | null>(null);

	// Listen for reset filter event from header
	useEffect(() => {
		const handleResetFilter = () => {
			setSelectedGame(null);
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

	const normalizeTag = (value: string) =>
		value
			.toUpperCase()
			.normalize("NFKD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/[^A-Z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "");

	const filteredUmbrellas = React.useMemo(() => {
		// First filter out inactive umbrellas
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			return (umbrella as any).active === true;
		});

		// Find ESPORTS tag
		const esportsTag = tags.find(
			(t) => normalizeTag(t.label) === "ESPORTS"
		);

		return activeUmbrellas
			.filter((umbrella) => {
				const children = (umbrella as any).children as
					| Array<any>
					| undefined;
				if (!children || children.length === 0) return false;

				// Check if any child has the ESPORTS tag
				const hasEsportsTag = children.some((q) => {
					const tagIds: string[] | undefined = (q &&
						(q as any).tagIds) as any;
					// MUST have tagIds array (skip questions with legacy tags only)
					if (!Array.isArray(tagIds) || tagIds.length === 0) {
						return false;
					}
					return esportsTag && tagIds.includes(esportsTag._id);
				});

				// Filter based on filterType
				if (filterType === "esports") {
					return hasEsportsTag;
				} else {
					// games
					return !hasEsportsTag;
				}
			})
			.filter((umbrella) => {
				// For esports, filter out umbrellas with status "finished"
				if (filterType === "esports") {
					const status = (umbrella as any).status;
					if (typeof status === "string" && status === "finished") {
						return false;
					}
				}
				return true;
			})
			.filter((umbrella) => {
				// Apply secondary game filter if selected
				if (!selectedGame) return true;

				// Find the selected tag by label
				const selectedTag = tags.find((t) => t.label === selectedGame);
				if (!selectedTag) return true;

				const children = (umbrella as any).children as
					| Array<any>
					| undefined;
				if (!children || children.length === 0) return false;

				return children.some((q) => {
					const tagIds: string[] | undefined = (q &&
						(q as any).tagIds) as any;
					// MUST have tagIds array (skip questions with legacy tags only)
					if (!Array.isArray(tagIds) || tagIds.length === 0) {
						return false;
					}
					return tagIds.includes(selectedTag._id);
				});
			});
	}, [umbrellas, filterType, selectedGame, tags]);

	const calendarData = React.useMemo(() => {
		if (filterType !== "esports") {
			return null;
		}

		const todayStart = startOfLocalDay(new Date());
		const todayStartMs = todayStart.getTime();

		type CalendarEvent = { umbrella: Umbrella; eventDate: Date };
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

			if (dayStart.getTime() >= todayStartMs) {
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
		const sortByEventTime = (events: CalendarEvent[]) => {
			events.sort((left, right) => {
				return (
					left.eventDate.getTime() - right.eventDate.getTime()
				);
			});
		};

		const upcomingDays = Array.from(upcomingMap.values())
			.sort(sortByDate)
			.map((day) => {
				sortByEventTime(day.events);
				return day;
			});

		const pastDays = Array.from(pastMap.values())
			.sort(sortByDate)
			.map((day) => {
				sortByEventTime(day.events);
				return day;
			});

		return {
			todayStartMs,
			upcomingDays,
			pastDays,
			unscheduled,
		};
	}, [filteredUmbrellas, filterType]);

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

	const pageTitle = filterType === "esports" ? "Esports" : "Games";
	const noMarketsMessage =
		filterType === "esports"
			? "No current esports markets"
			: "No current games markets";

	const shouldUseCalendar = filterType === "esports";

	let content: React.ReactNode = null;

	if (shouldUseCalendar && calendarData) {
		const hasUpcoming = calendarData.upcomingDays.length > 0;
		const hasPast = calendarData.pastDays.length > 0;
		const hasUnscheduled = calendarData.unscheduled.length > 0;
		const hasAny = hasUpcoming || hasPast || hasUnscheduled;

		if (!hasAny) {
			content = (
				<div className="no-markets-message no-markets-message--empty">
					<p>
						{selectedGame
							? `No current ${pageTitle.toLowerCase()} markets for ${selectedGame}`
							: noMarketsMessage}
					</p>
				</div>
			);
		} else {
			content = (
				<div className="prediction-calendar">
					{calendarData.upcomingDays.map((day) => {
						const label = formatDayLabel(
							day.date,
							calendarData.todayStartMs
						);
	return (
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
								</header>
								<div className="predictions-grid prediction-calendar-grid">
									{day.events.map((event) =>
										renderPredictionCard(event.umbrella)
									)}
								</div>
							</section>
						);
					})}

					{hasUnscheduled ? (
						<section className="prediction-calendar-day prediction-calendar-day--unscheduled">
							<header className="prediction-calendar-header">
								<div className="prediction-calendar-title">
									<span className="prediction-calendar-primary">
										To Be Scheduled
									</span>
									<span className="prediction-calendar-secondary">
										Event date not provided
									</span>
								</div>
							</header>
							<div className="predictions-grid prediction-calendar-grid">
								{calendarData.unscheduled.map(
									(umbrellaItem) =>
										renderPredictionCard(umbrellaItem)
								)}
							</div>
						</section>
					) : null}

					{hasPast ? (
						<section className="prediction-calendar-archive">
							<h3 className="prediction-calendar-archive-title">
								Recent Events
							</h3>
							{calendarData.pastDays.map((day) => {
								const label = formatDayLabel(
									day.date,
									calendarData.todayStartMs
								);
								return (
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
										</header>
										<div className="predictions-grid prediction-calendar-grid">
											{day.events.map((event) =>
												renderPredictionCard(
													event.umbrella
												)
											)}
										</div>
									</section>
								);
							})}
						</section>
					) : null}
				</div>
			);
		}
	} else {
		// Add carousel class for esports on mobile
		const gridClassName =
			filterType === "esports"
				? "predictions-grid predictions-grid--carousel"
				: "predictions-grid";

		content = (
			<div className={gridClassName}>
				{filteredUmbrellas.length > 0 ? (
					<>
						{filteredUmbrellas.map((umbrella) =>
							renderPredictionCard(umbrella)
						)}
						{/* View All Card - Only visible on mobile for esports */}
						{filterType === "esports" && (
							<div
								className="view-all-card-filtered"
								onClick={() => {
									// Scroll to top to show all markets
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
							{selectedGame
								? `No current ${pageTitle.toLowerCase()} markets for ${selectedGame}`
								: noMarketsMessage}
						</p>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="predictions-page page-layout">
			{/* Show PromotionBar only for non-authenticated users */}
			{!authenticated && <PromotionBar />}
			<GameLinks
				selectedGame={selectedGame}
				onGameSelect={setSelectedGame}
				umbrellas={umbrellas}
				loading={loading}
				filterType={filterType}
			/>
			{content}
		</div>
	);
}
