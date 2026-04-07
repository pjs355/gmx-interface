import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { useSignerContext } from "context/SignerContext";
import { PredictionCard } from "../Predictions/components/PredictionCard";
import { LoadingState } from "../Predictions/components/LoadingState";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { resolveUmbrellaEventDate } from "../Predictions/utils/eventDates";
import "./Home.scss";

const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

export default function Home() {
	const navigate = useNavigate();
	const { authenticated } = useSignerContext();
	const [imagesReady, setImagesReady] = useState(false);

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

	const { gamingUmbrellas, esportsUmbrellas } = React.useMemo(() => {
		// First filter out inactive umbrellas
		const activeUmbrellas = umbrellas.filter((umbrella) => {
			return (umbrella as any).active === true;
		});

		// Find ESPORTS tag
		const esportsTag = tags.find(
			(t) => normalizeTag(t.label) === "ESPORTS"
		);

		const gaming: Umbrella[] = [];
		const esports: Umbrella[] = [];
		const now = Date.now();

		activeUmbrellas.forEach((umbrella) => {
			const children = (umbrella as any).children as
				| Array<any>
				| undefined;
			if (!children || children.length === 0) return;

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

			if (hasEsportsTag) {
				// Check if market has ended (event date + live window has passed)
				const eventDate = resolveUmbrellaEventDate(umbrella);
				const eventMs = eventDate ? eventDate.getTime() : null;
				const isEnded = eventMs !== null && now > eventMs + LIVE_WINDOW_MS;

				// Only add non-ended markets
				if (!isEnded) {
					esports.push(umbrella);
				}
			} else {
				gaming.push(umbrella);
			}
		});

		// Sort esports by live status and start time
		esports.sort((a, b) => {
			const aEventDate = resolveUmbrellaEventDate(a);
			const bEventDate = resolveUmbrellaEventDate(b);

			const aEventMs = aEventDate ? aEventDate.getTime() : null;
			const bEventMs = bEventDate ? bEventDate.getTime() : null;

			// Determine if markets are live
			const aIsLive = aEventMs !== null && now >= aEventMs && (now - aEventMs) <= LIVE_WINDOW_MS;
			const bIsLive = bEventMs !== null && now >= bEventMs && (now - bEventMs) <= LIVE_WINDOW_MS;

			// Live markets come first
			if (aIsLive && !bIsLive) return -1;
			if (!aIsLive && bIsLive) return 1;

			// If both live or both not live, sort by start time
			// Markets without dates go to the end
			if (aEventMs === null && bEventMs === null) return 0;
			if (aEventMs === null) return 1;
			if (bEventMs === null) return -1;

			// Sort by soonest start time
			return aEventMs - bEventMs;
		});

		return {
			gamingUmbrellas: gaming.slice(0, 3),
			esportsUmbrellas: esports.slice(0, 3),
		};
	}, [umbrellas, tags]);

	// Get total counts for "View all" links
	const gamingCount = React.useMemo(() => {
		const activeUmbrellas = umbrellas.filter(
			(umbrella) => (umbrella as any).active === true
		);
		const esportsTag = tags.find(
			(t) => normalizeTag(t.label) === "ESPORTS"
		);

		return activeUmbrellas.filter((umbrella) => {
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

			return !hasEsportsTag;
		}).length;
	}, [umbrellas, tags]);

	const esportsCount = React.useMemo(() => {
		const activeUmbrellas = umbrellas.filter(
			(umbrella) => (umbrella as any).active === true
		);
		const esportsTag = tags.find(
			(t) => normalizeTag(t.label) === "ESPORTS"
		);

		return activeUmbrellas.filter((umbrella) => {
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

			return hasEsportsTag;
		}).length;
	}, [umbrellas, tags]);

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
		if (loading) return;

		const allDisplayedUmbrellas = [
			...gamingUmbrellas,
			...esportsUmbrellas,
		];

		if (allDisplayedUmbrellas.length === 0) {
			setImagesReady(true);
			return;
		}

		// Only preload if umbrella has an explicit image URL set
		const imageUrls = allDisplayedUmbrellas
			.map((u) => u.image)
			.filter(Boolean);

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
	}, [loading, gamingUmbrellas, esportsUmbrellas]);

	const handleRetry = () => {
		window.location.reload();
	};

	if (loading || error || !imagesReady) {
		return <LoadingState error={error ?? null} onRetry={handleRetry} />;
	}

	return (
		<div className="home-page page-layout">
			{/* Gaming Section */}
			<div className="home-section">
				<div className="home-section-header">
					<h2
						className="home-section-title"
						onClick={() => navigate("/predictions/games")}
					>
						Gaming
						<svg
							className="home-section-arrow"
							width="20"
							height="20"
							viewBox="0 0 20 20"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M7.5 5L12.5 10L7.5 15"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</h2>
					<button
						className="home-view-all home-view-all-desktop"
						onClick={() => navigate("/predictions/games")}
					>
						View all ({gamingCount})
					</button>
				</div>

				{gamingUmbrellas.length > 0 ? (
					<div className="predictions-grid">
						{gamingUmbrellas.map((umbrella) => (
							<PredictionCard
								key={umbrella._id}
								umbrella={umbrella}
								singleMarketOrderbooks={singleMarketOrderbooks}
								singleMarketQuestions={singleMarketQuestions}
								multiMarketData={multiMarketData}
								onNavigateToUmbrella={navigateToUmbrella}
								onNavigateToSingleMarket={
									navigateToSingleMarket
								}
								onNavigateToMultiMarket={navigateToMultiMarket}
							/>
						))}
						{/* View All Card - Only visible on mobile */}
						<div
							className="view-all-card"
							onClick={() => navigate("/predictions/games")}
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
										d="M13 5L20 12L13 19M4 12H20"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<h3 className="view-all-card-title">
									View All Gaming
								</h3>
								<p className="view-all-card-count">
									{gamingCount} markets
								</p>
							</div>
						</div>
					</div>
				) : (
					<div className="no-markets-message">
						<p>No gaming markets available</p>
					</div>
				)}
			</div>

			{/* Esports Section */}
			<div className="home-section">
				<div className="home-section-header">
					<h2
						className="home-section-title"
						onClick={() => navigate("/predictions/esports")}
					>
						Esports
						<svg
							className="home-section-arrow"
							width="20"
							height="20"
							viewBox="0 0 20 20"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M7.5 5L12.5 10L7.5 15"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</h2>
					<button
						className="home-view-all home-view-all-desktop"
						onClick={() => navigate("/predictions/esports")}
					>
						View all ({esportsCount})
					</button>
				</div>

				{esportsUmbrellas.length > 0 ? (
					<div className="predictions-grid">
						{esportsUmbrellas.map((umbrella) => (
							<PredictionCard
								key={umbrella._id}
								umbrella={umbrella}
								singleMarketOrderbooks={singleMarketOrderbooks}
								singleMarketQuestions={singleMarketQuestions}
								multiMarketData={multiMarketData}
								onNavigateToUmbrella={navigateToUmbrella}
								onNavigateToSingleMarket={
									navigateToSingleMarket
								}
								onNavigateToMultiMarket={navigateToMultiMarket}
							/>
						))}
						{/* View All Card - Only visible on mobile */}
						<div
							className="view-all-card"
							onClick={() => navigate("/predictions/esports")}
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
										d="M13 5L20 12L13 19M4 12H20"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								<h3 className="view-all-card-title">
									View All Esports
								</h3>
								<p className="view-all-card-count">
									{esportsCount} markets
								</p>
							</div>
						</div>
					</div>
				) : (
					<div className="no-markets-message">
						<p>No esports markets available</p>
					</div>
				)}
			</div>
		</div>
	);
}

