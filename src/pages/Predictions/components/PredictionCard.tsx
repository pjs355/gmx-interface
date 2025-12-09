import React, { useState, useEffect, useMemo } from "react";
import { Trans } from "@lingui/macro";
import Button from "components/Button/Button";
import CountdownTimer from "components/CountdownTimer/CountdownTimer";
import { SingleMarketActions } from "./SingleMarketActions";
import { MultiMarketActions } from "./MultiMarketActions";
import { mixpanelTrack } from "@/utils/mixpanel";
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
const gameBannerModules = import.meta.glob<{ default: string }>(
	"../../../assets/game-banners/*",
	{ eager: true }
);

const gameBannerMap: Record<string, string> = Object.entries(
	gameBannerModules
).reduce((acc, [path, module]) => {
	const fileName = path
		.split("/")
		.pop()
		?.replace(/\.[^.]+$/, "");
	// Access the default export from the module
	const url = module?.default;
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

	const dailyTagId = useMemo(() => {
		for (let index = 0; index < tags.length; index += 1) {
			const tag = tags[index];
			const normalizedLabel = normalizeTagLabel(tag.label);
			// Check both normalized label and slug
			if (
				normalizedLabel === "DAILY" ||
				tag.slug?.toLowerCase() === "daily"
			) {
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

	const isDailyUmbrella = useMemo(() => {
		if (dailyTagId === null) {
			return false;
		}
		// Use originalChildren if available (has tagIds), otherwise fall back to children
		const children =
			(umbrella as any).originalChildren || umbrella.children || [];
		if (!Array.isArray(children) || children.length === 0) {
			return false;
		}
		// Check if first child has daily tag
		const firstChild = children[0];
		const tagIds = firstChild?.tagIds;
		if (Array.isArray(tagIds)) {
			return tagIds.includes(dailyTagId);
		}
		return false;
	}, [dailyTagId, umbrella]);

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

	// Get eventDate for both esports and daily
	const eventDate = useMemo(() => {
		if (!isEsportsUmbrella && !isDailyUmbrella) {
			return null;
		}
		return resolveUmbrellaEventDate(umbrella);
	}, [isEsportsUmbrella, isDailyUmbrella, umbrella]);

	const eventDateMs = useMemo(() => {
		if (eventDate === null) {
			return null;
		}
		return eventDate.getTime();
	}, [eventDate]);

	// Format date for daily markets: "Month, Day" (e.g., "January, 15")
	// Use UTC date to avoid timezone conversion issues
	const dailyDateText = useMemo(() => {
		if (!isDailyUmbrella || !eventDate) {
			return null;
		}
		// Get UTC date parts to avoid timezone conversion
		const utcMonth = eventDate.getUTCMonth();
		const utcDay = eventDate.getUTCDate();
		const utcYear = eventDate.getUTCFullYear();
		const utcDate = new Date(Date.UTC(utcYear, utcMonth, utcDay));
		return utcDate.toLocaleDateString("en-US", {
			month: "long",
			day: "numeric",
			timeZone: "UTC",
		});
	}, [isDailyUmbrella, eventDate]);

	// Process title for daily markets: remove date patterns
	const dailyTitleWithoutDate = useMemo(() => {
		if (!isDailyUmbrella) {
			return umbrella.displayName;
		}
		let title = umbrella.displayName;
		// Remove common date patterns from title
		if (eventDate) {
			// Get UTC date parts (what should be displayed)
			const utcMonth = eventDate.getUTCMonth(); // 0-11
			const utcDay = eventDate.getUTCDate();
			const utcYear = eventDate.getUTCFullYear();
			const utcDate = new Date(Date.UTC(utcYear, utcMonth, utcDay));

			// Also get local date parts (what might be in title from timezone conversion)
			const month = eventDate.getMonth();
			const day = eventDate.getDate();
			const year = eventDate.getFullYear();

			// Try to remove all possible date formats (both UTC and local)
			const datePatterns = [
				// UTC date formats (what should be displayed)
				utcDate.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					timeZone: "UTC",
				}), // "January 15"
				utcDate.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
					timeZone: "UTC",
				}), // "January 15, 2024"
				utcDate.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					timeZone: "UTC",
				}), // "Nov 15"
				utcDate.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
					timeZone: "UTC",
				}), // "Nov 15, 2024"
				// Formats without spaces (e.g., "Nov20", "Nov20")
				`${utcDate.toLocaleDateString("en-US", {
					month: "short",
					timeZone: "UTC",
				})}${utcDay}`, // "Nov20"
				`${utcDate.toLocaleDateString("en-US", {
					month: "long",
					timeZone: "UTC",
				})}${utcDay}`, // "November20"
				// Local date formats (what might be in title from timezone conversion)
				eventDate.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
				}), // "January 15"
				eventDate.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				}), // "January 15, 2024"
				eventDate.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				}), // "Nov 15"
				eventDate.toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				}), // "Nov 15, 2024"
				// Formats without spaces (e.g., "Nov20")
				`${eventDate.toLocaleDateString("en-US", {
					month: "short",
				})}${day}`, // "Nov20"
				`${eventDate.toLocaleDateString("en-US", {
					month: "long",
				})}${day}`, // "November20"
				// Numeric formats
				eventDate.toLocaleDateString("en-US", {
					month: "numeric",
					day: "numeric",
				}), // "1/15"
				eventDate.toLocaleDateString("en-US", {
					month: "numeric",
					day: "numeric",
					year: "numeric",
				}), // "1/15/2024"
				eventDate.toLocaleDateString("en-US", {
					month: "2-digit",
					day: "2-digit",
				}), // "01/15"
				eventDate.toLocaleDateString("en-US", {
					month: "2-digit",
					day: "2-digit",
					year: "numeric",
				}), // "01/15/2024"
				// Manual patterns (both UTC and local)
				`${month + 1}/${day}`,
				`${month + 1}/${day}/${year}`,
				`${utcMonth + 1}/${utcDay}`,
				`${utcMonth + 1}/${utcDay}/${utcYear}`,
				`${String(month + 1).padStart(2, "0")}/${String(day).padStart(
					2,
					"0"
				)}`,
				`${String(month + 1).padStart(2, "0")}/${String(day).padStart(
					2,
					"0"
				)}/${year}`,
				`${String(utcMonth + 1).padStart(2, "0")}/${String(
					utcDay
				).padStart(2, "0")}`,
				`${String(utcMonth + 1).padStart(2, "0")}/${String(
					utcDay
				).padStart(2, "0")}/${utcYear}`,
			];

			// Remove each date pattern from the title (case-insensitive)
			for (const pattern of datePatterns) {
				if (pattern) {
					// Escape special characters for regex
					const escapedPattern = pattern.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&"
					);
					const regex = new RegExp(escapedPattern, "gi");
					title = title.replace(regex, "");
				}
			}

			// Clean up separators and extra spaces
			// Remove patterns like " - January 15" or "January 15 - " or ", January 15"
			title = title.replace(/\s*[-–—,]\s*$/, ""); // Remove trailing separator
			title = title.replace(/^\s*[-–—,]\s*/, ""); // Remove leading separator
			title = title.replace(/\s*[-–—,]\s+/g, " "); // Replace separator with space
			title = title.replace(/\s+/g, " "); // Normalize multiple spaces to single space
			title = title.trim();
		}

		// For player count markets, keep only up to "Player Count" and remove "24 Hour"
		if (umbrella.displayName.includes("Player Count")) {
			const playerCountIndex = title.indexOf("Player Count");
			if (playerCountIndex !== -1) {
				title = title.substring(
					0,
					playerCountIndex + "Player Count".length
				);
			}
			title = title.replace(/24\s*Hour\s*/gi, "");
			title = title.trim();
		}

		return title || umbrella.displayName;
	}, [isDailyUmbrella, umbrella.displayName, eventDate]);

	// Process title parts for esports and daily markets
	const esportsTitleParts = useMemo(() => {
		const result = {
			headline: isDailyUmbrella
				? dailyTitleWithoutDate
				: umbrella.displayName,
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
	}, [
		isEsportsUmbrella,
		umbrella.displayName,
		isDailyUmbrella,
		dailyTitleWithoutDate,
	]);

	// For daily markets, calculate endDate as 23hrs 59min after eventDate
	const endDate = useMemo(() => {
		if (!isDailyUmbrella || eventDate === null) {
			return null;
		}
		// Add 23 hours and 59 minutes
		const end = new Date(eventDate);
		end.setHours(end.getHours() + 23);
		end.setMinutes(end.getMinutes() + 59);
		return end;
	}, [isDailyUmbrella, eventDate]);

	const endDateMs = useMemo(() => {
		if (endDate === null) {
			return null;
		}
		return endDate.getTime();
	}, [endDate]);

	// Use endDate for daily, eventDate for esports
	const countdownDate = useMemo(() => {
		if (isDailyUmbrella && endDate !== null) {
			return endDate;
		}
		if (isEsportsUmbrella && eventDate !== null) {
			return eventDate;
		}
		return null;
	}, [isDailyUmbrella, isEsportsUmbrella, endDate, eventDate]);

	const countdownDateMs = useMemo(() => {
		if (countdownDate === null) {
			return null;
		}
		return countdownDate.getTime();
	}, [countdownDate]);

	useEffect(() => {
		if (countdownDateMs === null) {
			return;
		}
		const interval = window.setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => {
			window.clearInterval(interval);
		};
	}, [countdownDateMs]);

	// Build image URL list with fallback priority
	useEffect(() => {
		const urls: string[] = [];

		// 1. Custom image on umbrella
		if (umbrella.image) {
			urls.push(umbrella.image);
		}

		// 2. Firebase banner by umbrella ID
		const firebaseBanner = resolveUmbrellaBannerById(umbrella._id);
		if (firebaseBanner) {
			urls.push(firebaseBanner);
		}

		// 3. Game banner from umbrella.game field
		const normalizedGame = normalizeGameName(umbrella.game);
		if (normalizedGame && gameBannerMap[normalizedGame]) {
			urls.push(gameBannerMap[normalizedGame]);
		}

		// 4. Game banner from tag slug
		const children =
			(umbrella as any).originalChildren || umbrella.children;
		if (Array.isArray(children)) {
			for (const child of children) {
				const tagIds = child?.tagIds;
				if (!Array.isArray(tagIds)) continue;
				for (const tagId of tagIds) {
					const tag = tags.find((t) => t._id === tagId);
					if (!tag) continue;
					const banner = gameBannerMap[tag.slug];
					if (banner) {
						urls.push(banner);
					}
				}
			}
		}

		// 5. Alternative Firebase URLs (different extensions)
		urls.push(...getAlternativeImageUrls(umbrella._id));

		const unique = Array.from(new Set(urls.filter(Boolean))) as string[];
		setImageUrls(unique);
		setCurrentImageIndex(0);
		setImageError(false);
	}, [umbrella._id, umbrella.image, umbrella.game, umbrella.children, tags]);

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

			mixpanelTrack("PredictionCardClick", trackingData);
		} catch (error) {
			console.error("error", error);
		}
		onNavigateToUmbrella(umbrella);
	};

	const navigateToSingleMarket = (position: "yes" | "no") => {
		try {
			const question = singleMarketQuestions[umbrella._id];
			mixpanelTrack("PredictionCardWSideClick", {
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
			mixpanelTrack("PredictionCardWSideClick", {
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
			const isDailyPlayerCount =
				isDailyUmbrella &&
				umbrella.displayName.includes("Player Count");
			return (
				<SingleMarketActions
					orderbook={orderbook}
					onNavigate={navigateToSingleMarket}
					question={question}
					isDailyPlayerCount={isDailyPlayerCount}
				/>
			);
		} else if (umbrella.children && umbrella.children.length >= 2) {
			// Show top 2 markets with Yes/No buttons for multi-market umbrellas
			return (
				<MultiMarketActions
					umbrellaId={umbrella._id}
					multiMarketData={multiMarketData}
					onNavigate={navigateToMultiMarket}
					onNavigateToUmbrella={navigateToUmbrella}
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
	const hasCountdown = countdownDateMs !== null;

	// Live logic only for esports (based on eventDate)
	let isLive = false;
	if (isEsportsUmbrella && eventDateMs !== null) {
		if (now >= eventDateMs) {
			const elapsed = now - eventDateMs;
			if (elapsed <= LIVE_WINDOW_MS) {
				isLive = true;
			}
		}
	}

	// Upcoming logic: for esports use eventDate, for daily use endDate
	let isUpcoming = false;
	if (isEsportsUmbrella && eventDateMs !== null) {
		if (now < eventDateMs) {
			isUpcoming = true;
		}
	} else if (isDailyUmbrella && endDateMs !== null) {
		if (now < endDateMs) {
			isUpcoming = true;
		}
	}

	// Ended logic
	let isEnded = false;
	if (isEsportsUmbrella && eventDateMs !== null) {
		if (!isLive && !isUpcoming) {
			isEnded = true;
		}
	} else if (isDailyUmbrella && endDateMs !== null) {
		if (now >= endDateMs) {
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
	} else if (isDailyUmbrella && endDate !== null) {
		// For daily markets, always show countdown timer if endDate exists
		// CountdownTimer will handle showing "Ended" when time has passed
		statusContent = (
			<CountdownTimer
				target={endDate}
				className="prediction-countdown"
				expiredLabel="Ended"
				showZeroDays={false}
			/>
		);
	} else if (isUpcoming && countdownDate !== null) {
		// For esports that are upcoming
		statusContent = (
			<CountdownTimer
				target={countdownDate}
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
			<div
				className="prediction-banner"
				onClick={navigateToUmbrella}
				style={{ cursor: "pointer" }}
			>
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
						{isDailyUmbrella && dailyDateText ? (
							<span
								style={{
									display: "block",
									fontSize: "14px",
									color: "#9ca3af",
									marginBottom: "4px",
									fontWeight: 400,
								}}
							>
								{dailyDateText}
								<span
									style={{
										display: "inline-block",
										marginLeft: "8px",
										marginTop: "-4px",
										padding: "2px 8px",
										fontSize: "0.75em",
										fontWeight: 600,
										color: "#000000",
										backgroundColor: "#fbbf24",
										borderRadius: "12px",
										letterSpacing: "0.5px",
										verticalAlign: "middle",
										lineHeight: 1,
									}}
								>
									Daily
								</span>
							</span>
						) : null}
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
			{statusContent !== null ? (
				<div className="prediction-card-footer">
					{isDailyUmbrella ? "Ends In:" : "Starts In:"}
					&nbsp;&nbsp; {statusContent}
				</div>
			) : null}
		</div>
	);
};
