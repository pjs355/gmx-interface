import React, { useState, useEffect, useMemo } from "react";
import { Trans } from "@lingui/macro";
import Button from "components/Button/Button";
import CountdownTimer from "components/CountdownTimer/CountdownTimer";
import { SingleMarketActions } from "./SingleMarketActions";
import { MultiMarketActions } from "./MultiMarketActions";
import mixpanel from "mixpanel-browser";
import type {
	Umbrella,
	UmbrellaTeamMapping,
} from "services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	resolveUmbrellaBannerById,
	getAlternativeImageUrls,
} from "@/helpers/umbrellaBanners";
import { resolveTeamLogo } from "@/config/team-map";
import { usePredictionData } from "context/PredictionDataContext";
import { resolveUmbrellaEventDate } from "../utils/eventDates";

const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

function stripDisallowedLabelCharacters(value: string): string {
	let output = "";
	for (let index = 0; index < value.length; index += 1) {
		const charCode = value.charCodeAt(index);
		if (charCode === 32) {
			continue;
		}
		if (charCode >= 0 && charCode <= 31) {
			continue;
		}
		if (charCode === 127) {
			continue;
		}
		output += value[index];
	}
	return output;
}

function normalizeTagLabel(value: string): string {
	return stripDisallowedLabelCharacters(value.toUpperCase().normalize("NFKD"))
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}
const gameBannerModules = import.meta.glob<string>(
	"../../../assets/game-banners/*",
	{ eager: true, import: "default" }
);

const gameBannerMap: Record<string, string> = Object.entries(
	gameBannerModules
).reduce((acc, [path, url]) => {
	const fileName = path
		.split("/")
		.pop()
		?.replace(/\.[^.]+$/, "");
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

function getFirstLetter(text: string): string {
	if (text.length === 0) {
		return "?";
	}
	const first = text[0];
	if (first && /[a-zA-Z0-9]/.test(first)) {
		return first.toUpperCase();
	}
	return "?";
}

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
	const { tags } = usePredictionData();
	const [now, setNow] = useState(() => Date.now());

	if (typeof umbrella.displayName !== "string") {
		throw new Error("umbrella displayName missing");
	}

	const esportsTagId = useMemo(() => {
		for (let index = 0; index < tags.length; index += 1) {
			const tag = tags[index];
			const normalizedLabel = normalizeTagLabel(tag.label);
			if (normalizedLabel === "ESPORTS") {
				return tag._id;
			}
		}
		return null;
	}, [tags]);

	const isEsportsUmbrella = useMemo(() => {
		if (esportsTagId === null) {
			return false;
		}
		const children = umbrella.children;
		if (!Array.isArray(children)) {
			return false;
		}
		for (let index = 0; index < children.length; index += 1) {
			const child = children[index];
			const tagIds = child?.tagIds;
			if (Array.isArray(tagIds)) {
				if (tagIds.includes(esportsTagId)) {
					return true;
				}
			}
		}
		return false;
	}, [esportsTagId, umbrella.children]);

	const esportsTitleParts = useMemo(() => {
		const result = {
			headline: umbrella.displayName,
			subtitle: "",
		};
		if (!isEsportsUmbrella) {
			return result;
		}
		const segments = umbrella.displayName.split("-").map((segment) => {
			return segment.trim();
		});
		if (segments.length > 0) {
			const primary = segments[0];
			if (primary.length > 0) {
				result.headline = primary;
			}
		}
		if (segments.length > 1) {
			const remaining: string[] = [];
			for (let index = 1; index < segments.length; index += 1) {
				const candidate = segments[index];
				if (candidate.length > 0) {
					remaining.push(candidate);
				}
			}
			if (remaining.length > 0) {
				result.subtitle = remaining.join(" - ");
			}
		}
		return result;
	}, [isEsportsUmbrella, umbrella.displayName]);

	const teamLogos = useMemo(() => {
		const mappings = umbrella.teamMappings;
		if (!Array.isArray(mappings)) {
			return [] as Array<{
				logoUrl: string | null;
				displayName: string;
			}>;
		}

		const normalizedGame = normalizeGameName(umbrella.game);
		const isStarCraft2 = normalizedGame === "starcraft-2";

		const resolved: Array<{
			logoUrl: string | null;
			displayName: string;
		}> = [];
		for (let index = 0; index < mappings.length; index += 1) {
			const mapping = mappings[index];
			const resolvedLogoUrl = resolveTeamLogoUrl(mapping);
			resolved.push({
				logoUrl: isStarCraft2
					? null
					: typeof resolvedLogoUrl === "string" &&
					  resolvedLogoUrl.length > 0
					? resolvedLogoUrl
					: null,
				displayName: mapping.displayName,
			});
		}
		return resolved;
	}, [umbrella.teamMappings, umbrella.game]);

	const eventDate = useMemo(
		() => resolveUmbrellaEventDate(umbrella),
		[umbrella]
	);
	const eventDateMs = useMemo(() => {
		if (eventDate === null) {
			return null;
		}
		return eventDate.getTime();
	}, [eventDate]);

	useEffect(() => {
		if (eventDateMs === null) {
			return;
		}
		const interval = window.setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => {
			window.clearInterval(interval);
		};
	}, [eventDateMs]);

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

		const uniqueUrls = Array.from(
			new Set(urls.filter(Boolean))
		) as string[];
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
		try {
			const isSingleMarket =
				umbrella.children && umbrella.children.length === 1;
			const isMultiMarket =
				umbrella.children && umbrella.children.length >= 2;

			const trackingData: any = {
				umbrellaId: umbrella._id,
				umbrellaName: umbrella.displayName,
			};

			if (isSingleMarket) {
				const question = singleMarketQuestions[umbrella._id];
				if (question) {
					trackingData.marketId = question._id || question.questionId;
					trackingData.marketName =
						question.displayName || question.question;
					trackingData.marketType = "single";
				}
			} else if (isMultiMarket) {
				trackingData.marketType = "multi";
				trackingData.marketCount = umbrella.children?.length || 0;
				const multiData = multiMarketData[umbrella._id];
				if (
					multiData &&
					multiData.questions &&
					multiData.questions.length > 0
				) {
					trackingData.marketIds = multiData.questions.map(
						(q) => q._id || q.questionId
					);
					trackingData.marketNames = multiData.questions.map(
						(q) => q.displayName || q.question
					);
				}
			} else {
				trackingData.marketType = "none";
			}

			mixpanel.track("PredictionCardClick", trackingData);
		} catch (error) {
			console.error("error", error);
		}
		onNavigateToUmbrella(umbrella);
	};

	const navigateToSingleMarket = (position: "yes" | "no") => {
		try {
			const question = singleMarketQuestions[umbrella._id];
			mixpanel.track("PredictionCardWSideClick", {
				umbrellaId: umbrella._id,
				umbrellaName: umbrella.displayName,
				marketId: question?._id || question?.questionId,
				marketName: question?.displayName || question?.question,
				position: position,
				marketType: "single",
			});
		} catch (error) {
			console.error("error", error);
		}
		onNavigateToSingleMarket(umbrella, position);
	};

	const navigateToMultiMarket = (
		question: PredictionMarket,
		position: "yes" | "no"
	) => {
		try {
			mixpanel.track("PredictionCardWSideClick", {
				umbrellaId: umbrella._id,
				umbrellaName: umbrella.displayName,
				marketId: question._id || question.questionId,
				marketName: question.displayName || question.question,
				questionId: question._id || question.questionId,
				questionName: question.displayName || question.question,
				position: position,
				marketType: "multi",
			});
		} catch (error) {
			console.error("error", error);
		}
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
					<strong>
						<Trans>Explore Questions</Trans>
					</strong>
				</Button>
			);
		}
	};

	const bannerImageUrl = imageUrls[currentImageIndex];
	const shouldShowImage = Boolean(bannerImageUrl) && !imageError;
	const hasPandascoreMatch =
		typeof umbrella.pandascore_matchId === "string" &&
		umbrella.pandascore_matchId.length > 0;
	const showTeamLogos =
		teamLogos.length >= 2 &&
		(hasPandascoreMatch || teamLogos.some((t) => t.logoUrl !== null));
	const showPlaceholderIcon = !shouldShowImage && !showTeamLogos;
	const subtitleContent = isEsportsUmbrella ? esportsTitleParts.subtitle : "";
	const shouldRenderSubtitle = subtitleContent.length > 0;
	const hasEventDate = eventDateMs !== null;

	let isLive = false;
	if (eventDateMs !== null) {
		if (now >= eventDateMs) {
			const elapsed = now - eventDateMs;
			if (elapsed <= LIVE_WINDOW_MS) {
				isLive = true;
			}
		}
	}

	let isUpcoming = false;
	if (eventDateMs !== null) {
		if (now < eventDateMs) {
			isUpcoming = true;
		}
	}

	let isEnded = false;
	if (eventDateMs !== null) {
		if (!isLive && !isUpcoming) {
			isEnded = true;
		}
	}

	let statusContent: React.ReactNode = null;
	if (isLive) {
		statusContent = (
			<div className="prediction-live-indicator">
				<span className="prediction-live-dot" />
				<span className="prediction-live-text">Live</span>
			</div>
		);
	} else if (isUpcoming) {
		statusContent = (
			<CountdownTimer
				target={eventDate as Date}
				className="prediction-countdown"
				expiredLabel="Ended"
				showZeroDays={false}
			/>
		);
	} else if (isEnded) {
		statusContent = <span className="prediction-ended-label">Ended</span>;
	}

	const handleCardClick = (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (
			target.closest(".prediction-actions") ||
			target.closest(".action-button")
		) {
			return;
		}
		navigateToUmbrella();
	};

	return (
		<div
			key={umbrella._id}
			className="prediction-card"
			onClick={handleCardClick}
			style={{ cursor: "pointer" }}
		>
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
							{teamLogos[0].logoUrl ? (
								<img
									src={teamLogos[0].logoUrl}
									alt={teamLogos[0].displayName}
									className="banner-team-logo"
								/>
							) : (
								<div className="banner-team-fallback">
									{getFirstLetter(teamLogos[0].displayName)}
								</div>
							)}
						</div>
						<span className="banner-vs">VS</span>
						<div className="banner-team">
							{teamLogos[1].logoUrl ? (
								<img
									src={teamLogos[1].logoUrl}
									alt={teamLogos[1].displayName}
									className="banner-team-logo"
								/>
							) : (
								<div className="banner-team-fallback">
									{getFirstLetter(teamLogos[1].displayName)}
								</div>
							)}
						</div>
					</div>
				)}
			</div>

			<div className="prediction-card-content">
				<div className="prediction-details">
					<h3
						className="prediction-title"
						style={{
							transition: "color 0.2s ease",
						}}
					>
						{shouldRenderSubtitle ? (
							<span className="prediction-title-prefix">
								{subtitleContent}
							</span>
						) : null}
						<span className="prediction-title-main">
							{esportsTitleParts.headline}
						</span>
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

			<div
				className="prediction-actions"
				onClick={(e) => e.stopPropagation()}
			>
				{renderActions()}
			</div>
			{hasEventDate && statusContent !== null ? (
				<div className="prediction-card-footer">
					Starts In:&nbsp;&nbsp; {statusContent}
				</div>
			) : null}
		</div>
	);
};
