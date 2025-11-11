import React, { useState, useEffect, useMemo } from "react";
import { Trans } from "@lingui/macro";
import Button from "components/Button/Button";
import { SingleMarketActions } from "./SingleMarketActions";
import { MultiMarketActions } from "./MultiMarketActions";
import type { Umbrella, UmbrellaTeamMapping } from "services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	resolveUmbrellaBannerById,
	getAlternativeImageUrls,
} from "@/helpers/umbrellaBanners";
import { resolveTeamLogo } from "@/config/team-map";

const gameBannerModules = import.meta.glob<string>(
	"../../../assets/game-banners/*",
	{ eager: true, import: "default" }
);

const gameBannerMap: Record<string, string> = Object.entries(
	gameBannerModules
).reduce((acc, [path, url]) => {
	const fileName = path.split("/").pop()?.replace(/\.[^.]+$/, "");
	if (fileName && typeof url === "string") {
		acc[fileName] = url;
	}
	return acc;
}, {} as Record<string, string>);

const normalizeGameName = (game?: string | null): string | null => {
	if (!game) {
		return null;
	}
	return game
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
};

interface PredictionCardProps {
	umbrella: Umbrella;
	singleMarketOrderbooks: { [umbrellaId: string]: any };
	singleMarketQuestions: { [umbrellaId: string]: PredictionMarket };
	multiMarketData: {
		[umbrellaId: string]: {
			questions: PredictionMarket[];
			orderbooks: { [questionId: string]: any };
		};
	};
	onNavigateToUmbrella: (umbrella: Umbrella) => void;
	onNavigateToSingleMarket: (
		umbrella: Umbrella,
		position: "yes" | "no"
	) => void;
	onNavigateToMultiMarket: (
		umbrella: Umbrella,
		question: PredictionMarket,
		position: "yes" | "no"
	) => void;
}

const resolveTeamLogoUrl = (team: UmbrellaTeamMapping): string | undefined => {
	if (team.logoUrl) {
		return team.logoUrl;
	}
	if (team.shortCode) {
		const resolved = resolveTeamLogo(team.shortCode);
		if (resolved) {
			return resolved;
		}
	}
	if (team.slug) {
		const resolved = resolveTeamLogo(team.slug);
		if (resolved) {
			return resolved;
		}
	}
	if (team.displayName) {
		const resolved = resolveTeamLogo(team.displayName);
		if (resolved) {
			return resolved;
		}
	}
	return undefined;
};

export const PredictionCard: React.FC<PredictionCardProps> = ({
	umbrella,
	singleMarketOrderbooks,
	singleMarketQuestions,
	multiMarketData,
	onNavigateToUmbrella,
	onNavigateToSingleMarket,
	onNavigateToMultiMarket,
}) => {
	const [imageError, setImageError] = useState(false);
	const [currentImageIndex, setCurrentImageIndex] = useState(0);
	const [imageUrls, setImageUrls] = useState<string[]>([]);

	const sortedTeamMappings = useMemo(() => {
		if (!Array.isArray(umbrella.teamMappings)) {
			return [] as UmbrellaTeamMapping[];
		}
		return [...umbrella.teamMappings].slice(0, 2);
	}, [umbrella.teamMappings]);

	const teamLogos = useMemo(() => {
		return sortedTeamMappings
			.map((team) => {
				const logoUrl = resolveTeamLogoUrl(team);
				if (!logoUrl) {
					return null;
				}
				return {
					logoUrl,
					displayName: team.displayName,
					shortCode: team.shortCode,
				};
			})
			.filter(Boolean) as Array<{
				logoUrl: string;
				displayName: string;
				shortCode: string;
			}>;
	}, [sortedTeamMappings]);

	// Set up image URLs when umbrella changes
	useEffect(() => {
		const urls: string[] = [];

		if (umbrella.image) {
			urls.push(umbrella.image);
		}

		const resolvedBanner = resolveUmbrellaBannerById(umbrella._id);
		if (resolvedBanner) {
			urls.push(resolvedBanner);
		}

		const normalizedGame = normalizeGameName(umbrella.game);
		if (normalizedGame) {
			const gameBanner = gameBannerMap[normalizedGame];
			if (gameBanner) {
				urls.push(gameBanner);
			}
		}

		const alternativeUrls = getAlternativeImageUrls(umbrella._id);
		if (Array.isArray(alternativeUrls) && alternativeUrls.length > 0) {
			urls.push(...alternativeUrls);
		}

		const uniqueUrls = Array.from(new Set(urls.filter(Boolean))) as string[];
		setImageUrls(uniqueUrls);
		setCurrentImageIndex(0);
		setImageError(false);
	}, [umbrella._id, umbrella.image, umbrella.game]);

	const handleImageError = () => {
		if (currentImageIndex < imageUrls.length - 1) {
			setCurrentImageIndex((prev) => prev + 1);
		} else {
			setImageError(true);
		}
	};

	const navigateToUmbrella = () => {
		onNavigateToUmbrella(umbrella);
	};

	const navigateToSingleMarket = (position: "yes" | "no") => {
		onNavigateToSingleMarket(umbrella, position);
	};

	const navigateToMultiMarket = (
		question: PredictionMarket,
		position: "yes" | "no"
	) => {
		onNavigateToMultiMarket(umbrella, question, position);
	};

	const renderActions = () => {
		if (umbrella.children && umbrella.children.length === 1) {
			// Show Yes/No buttons for single market umbrellas
			const orderbook = singleMarketOrderbooks[umbrella._id];
			const question = singleMarketQuestions[umbrella._id];
			return (
				<SingleMarketActions
					orderbook={orderbook}
					onNavigate={navigateToSingleMarket}
					question={question}
				/>
			);
		} else if (umbrella.children && umbrella.children.length >= 2) {
			// Show top 2 markets with Yes/No buttons for multi-market umbrellas
			return (
				<MultiMarketActions
					umbrellaId={umbrella._id}
					multiMarketData={multiMarketData}
					onNavigate={navigateToMultiMarket}
				/>
			);
		} else {
			// Show Explore Questions button for umbrellas with no markets
			return (
				<Button
					variant="primary-action"
					className="action-button yes-button"
					onClick={navigateToUmbrella}
				>
					<strong><Trans>Explore Questions</Trans></strong>
				</Button>
			);
		}
	};

	const bannerImageUrl = imageUrls[currentImageIndex];
	const shouldShowImage = !!bannerImageUrl && !imageError;
	const showTeamLogos = teamLogos.length >= 2;
	const showPlaceholderIcon = !shouldShowImage && !showTeamLogos;

	return (
		<div key={umbrella._id} className="prediction-card">
			{/* Banner Image */}
			<div className="prediction-banner">
				{shouldShowImage ? (
					<img
						src={bannerImageUrl as string}
						alt={umbrella.displayName}
						className="banner-image"
						onError={handleImageError}
					/>
				) : (
					<div className="banner-placeholder">
						{showPlaceholderIcon && (
							<span className="placeholder-text">🎮</span>
						)}
					</div>
				)}
				{showTeamLogos && (
					<div className="banner-team-overlay">
						<div className="banner-team">
							<img
								src={teamLogos[0].logoUrl}
								alt={teamLogos[0].displayName}
								className="banner-team-logo"
							/>
						</div>
						<span className="banner-vs">VS</span>
						<div className="banner-team">
							<img
								src={teamLogos[1].logoUrl}
								alt={teamLogos[1].displayName}
								className="banner-team-logo"
							/>
						</div>
					</div>
				)}
			</div>

			<div className="prediction-card-content">
				<div className="prediction-details">
					<h3
						className="prediction-title"
						style={{
							cursor: "pointer",
							transition: "color 0.2s ease",
						}}
						onClick={navigateToUmbrella}
						onMouseEnter={(e) => {
							e.currentTarget.style.color = "#8b5cf6";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.color = "white";
						}}
					>
						{umbrella.displayName}
					</h3>
					{umbrella.description && (
						<p
							className="prediction-description"
							style={{
								color: "#888",
								fontSize: "14px",
								marginTop: "8px",
							}}
						>
							{umbrella.description}
						</p>
					)}
				</div>
			</div>

			<div className="prediction-actions">{renderActions()}</div>
		</div>
	);
};
