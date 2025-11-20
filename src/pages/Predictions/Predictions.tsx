import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { useSignerContext } from "context/SignerContext";
import { PredictionCard } from "./components/PredictionCard";
import { LoadingState } from "./components/LoadingState";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import "./Predictions.scss";
import GameLinks from "./components/GameLinks";
import { Search } from "./components/Search/Search";
import { PromotionBar } from "@/components/PromotionBar";

// Fisher-Yates shuffle algorithm for randomizing array order
function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export default function Predictions() {
	const navigate = useNavigate();
	const { authenticated } = useSignerContext();
	const [selectedGame, setSelectedGame] = useState<string | null>(null);
	const [imagesReady, setImagesReady] = useState(false);
	const [searchActive, setSearchActive] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<Umbrella[]>([]);

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

	const handleSearchActive = useCallback(
		async (active: boolean, query: string) => {
			if (!active) {
				setSearchActive(false);
				setSearchQuery("");
				setSearchResults([]);
				return;
			}

			try {
				const baseUrl = getPredictionApiBaseUrl();
				const response = await fetch(
					`${baseUrl}/umbrellas/search?q=${encodeURIComponent(query)}`
				);
				if (!response.ok) throw new Error("Search failed");

				const data = await response.json();
				setSearchResults(data.data || []);
				setSearchQuery(query);
				setSearchActive(true);
			} catch (error) {
				console.error("error", error);
			}
		},
		[]
	);

	const filteredUmbrellas = React.useMemo(() => {
		// If search is active, use search results instead
		if (searchActive && searchResults.length > 0) {
			return searchResults;
		}

		// First filter out inactive umbrellas
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			return (umbrella as any).active === true;
		});

		// Find ESPORTS tag to exclude esports markets from home page
		const esportsTag = tags.find(
			(t) => normalizeTag(t.label) === "ESPORTS"
		);

		// Filter out esports-tagged umbrellas
		const nonEsportsUmbrellas = activeUmbrellas.filter((umbrella) => {
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

			// Exclude umbrellas with esports tag from home page
			return !hasEsportsTag;
		});

		let filtered = nonEsportsUmbrellas;
		
		if (selectedGame) {
			// Find the selected tag by label
			const selectedTag = tags.find((t) => t.label === selectedGame);
			if (selectedTag) {
				filtered = nonEsportsUmbrellas.filter((umbrella) => {
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
			}
		}

		// Randomize the order of cards
		return shuffleArray(filtered);
	}, [umbrellas, selectedGame, tags, searchActive, searchResults]);

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

	// Preload banner images only for umbrellas being displayed
	useEffect(() => {
		if (loading || filteredUmbrellas.length === 0) return;

		// Only preload if umbrella has an explicit image URL set
		// Don't speculatively try Firebase URLs that might 404
		const imageUrls = filteredUmbrellas.map((u) => u.image).filter(Boolean);

		if (imageUrls.length === 0) {
			setImagesReady(true);
			return;
		}

		let loadedCount = 0;
		const totalImages = imageUrls.length;

		imageUrls.forEach((url) => {
			const img = new Image();
			img.onload = () => {
				loadedCount++;
				if (loadedCount === totalImages) {
					setImagesReady(true);
				}
			};
			img.onerror = () => {
				// Count errors as loaded to prevent hanging
				loadedCount++;
				if (loadedCount === totalImages) {
					setImagesReady(true);
				}
			};
			img.src = url as string;
		});

		// Fallback timeout - show page after 3 seconds even if images not loaded
		const timeout = setTimeout(() => {
			setImagesReady(true);
		}, 3000);

		return () => clearTimeout(timeout);
	}, [loading, filteredUmbrellas]);

	const handleRetry = () => {
		window.location.reload();
	};

	if (loading || error || !imagesReady) {
		return <LoadingState error={error ?? null} onRetry={handleRetry} />;
	}

	return (
		<div className="predictions-page page-layout">
			{/* Show PromotionBar only for non-authenticated users */}
			{!authenticated && <PromotionBar />}
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
						<p>{`No current markets for ${
							selectedGame ?? "this filter"
						}`}</p>
					</div>
				)}
			</div>
		</div>
	);
}
