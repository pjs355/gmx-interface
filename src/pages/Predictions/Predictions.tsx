import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { PredictionCard } from "./components/PredictionCard";
import { LoadingState } from "./components/LoadingState";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import "./Predictions.scss";
import ImageBanner from "./components/ImageBanner";
import GameLinks from "./components/GameLinks";
import { resolveUmbrellaBannerById } from "@/helpers/umbrellaBanners";

export default function Predictions() {
	const navigate = useNavigate();
	const [selectedGame, setSelectedGame] = useState<string | null>(null);
	const [imagesReady, setImagesReady] = useState(false);

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

		if (!selectedGame) return activeUmbrellas;

		// Find the selected tag by label
		const selectedTag = tags.find((t) => t.label === selectedGame);
		if (!selectedTag) return activeUmbrellas;

		return activeUmbrellas.filter((umbrella) => {
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
	}, [umbrellas, selectedGame, tags]);

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
			{/** <ImageBanner /> */}
			<GameLinks
				selectedGame={selectedGame}
				onGameSelect={setSelectedGame}
				umbrellas={umbrellas}
				loading={loading}
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
