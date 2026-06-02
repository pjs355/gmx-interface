import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { PredictionCard } from "./components/PredictionCard";
import { LoadingState } from "./components/LoadingState";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import "./Predictions.scss";
import { resolveHomeMatchWinnerQuestion } from "@/features/markets/presentation/esportsHomeCard";
import GameLinks from "./components/GameLinks";
import {
	gameFilterResetSelection,
	isUmbrellaLiveByEventDate,
	isUmbrellaStartingSoonByEventDate,
	LIVE_PILL_ID,
	normalizeTagLabel,
	STARTING_SOON_PILL_ID,
	useNowTick,
} from "./utils/gameLinkFilters";

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

export default function Predictions() {
	const navigate = useNavigate();
	const [selectedGame, setSelectedGame] = useState<string | null>(null);

	const {
		umbrellas,
		loading,
		error,
		singleMarketOrderbooks,
		singleMarketQuestions,
		multiMarketData,
		tags,
	} = usePredictionData();

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

	const now = useNowTick(60_000);

	const filteredUmbrellas = useMemo(() => {
		// First filter out inactive umbrellas
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			return (umbrella as any).active === true;
		});

		// Find ESPORTS tag to exclude esports markets from home page
		const esportsTag = tags.find((t) => normalizeTagLabel(t.label) === "ESPORTS");
		const esportsTagId = esportsTag?._id;

		// Filter out esports-tagged umbrellas
		let filtered = activeUmbrellas.filter((umbrella) => {
			const children = (umbrella as any).children as Array<any> | undefined;
			if (!children || children.length === 0) return false;

			// Check if any child has the ESPORTS tag
			const hasEsportsTag = children.some((q) => {
				const tagIds: string[] | undefined = (q && (q as any).tagIds) as any;
				// MUST have tagIds array (skip questions with legacy tags only)
				if (!Array.isArray(tagIds) || tagIds.length === 0) {
					return false;
				}
				return esportsTag && tagIds.includes(esportsTag._id);
			});

			// Exclude umbrellas with esports tag from home page
			return !hasEsportsTag;
		});

		if (selectedGame && selectedGame !== LIVE_PILL_ID && selectedGame !== STARTING_SOON_PILL_ID) {
			const selectedTag = tags.find((t) => t.label === selectedGame);
			if (selectedTag) {
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

		// Sort by trading activity (most trades first)
		return sortByTradingActivity(filtered);
	}, [umbrellas, selectedGame, tags, now]);

	const filterLabelForEmpty =
		selectedGame === LIVE_PILL_ID
			? "Live"
			: selectedGame === STARTING_SOON_PILL_ID
				? "Starting Soon"
				: selectedGame;

	// Navigation functions
	const navigateToUmbrella = (umbrella: Umbrella) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
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

		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const handleRetry = () => {
		window.location.reload();
	};

	if (loading || error) {
		return <LoadingState error={error ?? null} onRetry={handleRetry} />;
	}

	return (
		<div className="predictions-page page-layout">
			<div className="predictions-page__body">
				{/** <ImageBanner /> */}
				{/* <Search
					onSearchActive={handleSearchActive}
					searchResults={searchResults}
					activeQuery={searchQuery}
				/> */}
				<GameLinks
					selectedGame={selectedGame}
					onGameSelect={setSelectedGame}
					umbrellas={umbrellas}
					loading={loading}
					filterType="games"
				/>

				<div className="predictions-page__main">
					<div className="predictions-grid">
						{filteredUmbrellas.length > 0 ? (
							filteredUmbrellas.map((umbrella) => (
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
							))
						) : (
							<div className="no-markets-message no-markets-message--empty">
								<p>{`No current markets for ${filterLabelForEmpty ?? "this filter"}`}</p>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
