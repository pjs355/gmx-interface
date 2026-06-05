import React, { useState, useEffect, useMemo } from "react";
import { Trans } from "@lingui/macro";
import Button from "components/Button/Button";
import CountdownTimer from "components/CountdownTimer/CountdownTimer";
import { SingleMarketActions } from "./SingleMarketActions";
import { MultiMarketActions } from "./MultiMarketActions";
import { mixpanelTrack } from "@/shared/analytics/mixpanel";
import type { Umbrella, UmbrellaTeamMapping } from "services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { truncateMarketName } from "@/features/markets/presentation/marketLabels";
import { resolveTeamLogo } from "@/config/team-map";
import { usePredictionData } from "context/PredictionDataContext";
import { useMatchVenuePrices, useOddsMonitor } from "@/context/OddsMonitorContext";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import { buildPandaOddsRowSpecs } from "@/features/markets/presentation/pandaOddsRows";
import { EsportsMatchMapOddsGrid } from "./EsportsMatchMapOddsGrid";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { resolveUmbrellaEventDate } from "../utils/eventDates";
import { useHomeTradeDockOptional } from "./HomeInlineTradeLayout";
import { useCurtainActions } from "@/components/PredictionMarketTradeBox";
import gtaIcon from "@/assets/img/ic_gtaVI_24.jpg";
import {
	bundledGameLogoFromTagLabels,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
	resolveLogoByTags,
} from "@/features/markets/assets/gameLogoResolver";
import { formatUmbrellaCrossVenueVolumeLabel } from "@/features/markets/presentation/umbrellaVolume";
import {
	resolveEsportsCardGameHeadline,
	resolveHomeMatchWinnerQuestion,
} from "@/features/markets/presentation/esportsHomeCard";
import { preloadPredictionMarketRoute } from "@/app/routes/predictionMarketRouteLazy";

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
	onNavigateToSingleMarket: (umbrella: Umbrella, position: "yes" | "no") => void;
	onNavigateToMultiMarket: (
		umbrella: Umbrella,
		question: PredictionMarket,
		position: "yes" | "no",
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

/** Same idea as Winnings / UmbrellaImage: team logo, then CS2 bundled asset before remote tag art when applicable, then GTA. */
function PredictionOutcomeTeamImg({
	umbrella,
	tags,
	teamLogoUrl,
	invertRemoteLogo,
	displayName,
}: {
	umbrella: Umbrella;
	tags: Array<{ _id: string; label: string; imageUrl?: string }>;
	teamLogoUrl: string | null;
	invertRemoteLogo: boolean;
	displayName: string;
}) {
	const candidates = useMemo(() => {
		const tagImg = getTagImageFromUmbrella(umbrella, tags);
		const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
		const gameLogo = resolveLogoByTags(tagLabels);
		const bundledGameLogo = bundledGameLogoFromTagLabels(tagLabels);
		const list: string[] = [];
		if (teamLogoUrl) list.push(teamLogoUrl);
		if (bundledGameLogo) list.push(bundledGameLogo);
		else {
			if (tagImg) list.push(tagImg);
			if (gameLogo) list.push(gameLogo);
		}
		list.push(gtaIcon);
		const out: string[] = [];
		const seen = new Set<string>();
		for (const u of list) {
			if (!u || seen.has(u)) continue;
			seen.add(u);
			out.push(u);
		}
		return out;
	}, [umbrella, tags, teamLogoUrl]);

	const chainKey = candidates.join("\0");
	const [index, setIndex] = useState(0);
	useEffect(() => {
		setIndex(0);
	}, [chainKey]);

	const src = candidates[index] ?? gtaIcon;
	const showController = !teamLogoUrl || index > 0;
	const invertActive = invertRemoteLogo && index === 0 && Boolean(teamLogoUrl);

	return (
		<img
			className={`prediction-card-outcome-logo-img${
				showController ? " prediction-card-outcome-logo-img--controller" : ""
			}${invertActive ? " prediction-card-outcome-logo-img--invert" : ""}`}
			src={src}
			alt={displayName}
			onError={() => setIndex((i) => (i < candidates.length - 1 ? i + 1 : i))}
		/>
	);
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
	const homeTradeDock = useHomeTradeDockOptional();
	const { openCurtain } = useCurtainActions();
	const { tags } = usePredictionData();
	const [now, setNow] = useState(() => Date.now());

	if (typeof umbrella.displayName !== "string") {
		throw new Error("umbrella displayName missing");
	}

	const pandascoreMatchIdForVenues =
		typeof umbrella.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
	const { appState: oddsAppState } = useOddsMonitor();
	const matchedVenueRow = useMatchVenuePrices(pandascoreMatchIdForVenues || null, umbrella._id);
	/** Row object is mutated in place on each WS tick; `timestamp` forces recompute when refs are stable. */
	const listingVenueYesNo = useMemo(
		() => listingBestYesNoFromMatched(matchedVenueRow),
		[matchedVenueRow, oddsAppState?.timestamp],
	);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		priceDebugLog("homepage PredictionCard venue overlay", {
			umbrellaId: umbrella._id,
			umbrellaName: umbrella.displayName,
			pandascoreMatchIdForVenues: pandascoreMatchIdForVenues || null,
			hasMatchedVenueRow: Boolean(matchedVenueRow),
			listingVenueYesNo,
			dataSource:
				"MatchedMarket from OddsMonitor (venue-prices WS + GET matched-markets); see getOddsWebSocketUrl / getMatchedMarketsUrl",
		});
	}, [
		umbrella._id,
		umbrella.displayName,
		pandascoreMatchIdForVenues,
		matchedVenueRow,
		listingVenueYesNo,
	]);

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
			if (normalizedLabel === "DAILY" || tag.slug?.toLowerCase() === "daily") {
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
		const children = (umbrella as any).originalChildren || umbrella.children || [];
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
				invertLogo: boolean;
			}>;
		}

		const normalizedGame = normalizeGameName(umbrella.game);
		const isStarCraft2 = normalizedGame === "starcraft-2";

		const resolved: Array<{
			logoUrl: string | null;
			displayName: string;
			invertLogo: boolean;
		}> = [];
		for (let index = 0; index < mappings.length; index += 1) {
			const mapping = mappings[index];
			const resolvedLogoUrl = resolveTeamLogoUrl(mapping);
			resolved.push({
				logoUrl: isStarCraft2
					? null
					: typeof resolvedLogoUrl === "string" && resolvedLogoUrl.length > 0
						? resolvedLogoUrl
						: null,
				displayName: mapping.displayName,
				invertLogo: mapping.invertLogo === true,
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
				`${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}`,
				`${String(month + 1).padStart(2, "0")}/${String(day).padStart(2, "0")}/${year}`,
				`${String(utcMonth + 1).padStart(2, "0")}/${String(utcDay).padStart(2, "0")}`,
				`${String(utcMonth + 1).padStart(2, "0")}/${String(utcDay).padStart(2, "0")}/${utcYear}`,
			];

			// Remove each date pattern from the title (case-insensitive)
			for (const pattern of datePatterns) {
				if (pattern) {
					// Escape special characters for regex
					const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
				title = title.substring(0, playerCountIndex + "Player Count".length);
			}
			title = title.replace(/24\s*Hour\s*/gi, "");
			title = title.trim();
		}

		return title || umbrella.displayName;
	}, [isDailyUmbrella, umbrella.displayName, eventDate]);

	const hasPandascoreMatch =
		typeof umbrella.pandascore_matchId === "string" && umbrella.pandascore_matchId.length > 0;

	const matchWinnerQuestion = useMemo(
		() => resolveHomeMatchWinnerQuestion(umbrella, { singleMarketQuestions, multiMarketData }),
		[umbrella, singleMarketQuestions, multiMarketData],
	);

	const isPandaEsportsListing = isEsportsUmbrella || hasPandascoreMatch;
	const useEsportsMatchWinnerCard = isPandaEsportsListing && matchWinnerQuestion !== null;

	// Series winner + each map that exists, as token-pair odds rows for the card.
	const esportsOddsRowSpecs = useMemo(
		() =>
			isPandaEsportsListing && pandascoreMatchIdForVenues
				? buildPandaOddsRowSpecs(
						pandascoreMatchIdForVenues,
						(umbrella.children ?? []) as unknown as Parameters<typeof buildPandaOddsRowSpecs>[1],
					)
				: [],
		[isPandaEsportsListing, pandascoreMatchIdForVenues, umbrella.children],
	);

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

	const navigateToUmbrella = () => {
		try {
			const isSingleMarket = umbrella.children && umbrella.children.length === 1;
			const isMultiMarket = umbrella.children && umbrella.children.length >= 2;

			const trackingData: any = {
				umbrellaId: umbrella._id,
				umbrellaName: umbrella.displayName,
			};

			if (isSingleMarket) {
				const question = singleMarketQuestions[umbrella._id];
				if (question) {
					trackingData.marketId = question._id || question.questionId;
					trackingData.marketName = question.displayName || question.question;
					trackingData.marketType = "single";
				}
			} else if (isMultiMarket) {
				trackingData.marketType = "multi";
				trackingData.marketCount = umbrella.children?.length || 0;
				const multiData = multiMarketData[umbrella._id];
				if (multiData && multiData.questions && multiData.questions.length > 0) {
					trackingData.marketIds = multiData.questions.map((q) => q._id || q.questionId);
					trackingData.marketNames = multiData.questions.map((q) => q.displayName || q.question);
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
		const question = useEsportsMatchWinnerCard
			? matchWinnerQuestion
			: singleMarketQuestions[umbrella._id];
		try {
			mixpanelTrack("PredictionCardWSideClick", {
				umbrellaId: umbrella._id,
				umbrellaName: umbrella.displayName,
				marketId: question?._id || question?.questionId,
				marketName: question?.displayName || question?.question,
				position: position,
				marketType: useEsportsMatchWinnerCard ? "esports-match-winner" : "single",
			});
		} catch (error) {
			console.error("error", error);
		}
		if (homeTradeDock?.onHomeOddsSelect && question) {
			homeTradeDock.onHomeOddsSelect({
				umbrella,
				question,
				position,
			});
			if (homeTradeDock.isHomeTradeMobile) {
				openCurtain();
			}
			return;
		}
		onNavigateToSingleMarket(umbrella, position);
	};

	const navigateToMultiMarket = (question: PredictionMarket, position: "yes" | "no") => {
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
		if (homeTradeDock?.onHomeOddsSelect) {
			homeTradeDock.onHomeOddsSelect({ umbrella, question, position });
			if (homeTradeDock.isHomeTradeMobile) {
				openCurtain();
			}
			return;
		}
		onNavigateToMultiMarket(umbrella, question, position);
	};

	const showTeamLogos =
		teamLogos.length >= 2 && (hasPandascoreMatch || teamLogos.some((t) => t.logoUrl !== null));

	const cardHeadline = useMemo(() => {
		if (isPandaEsportsListing) {
			return resolveEsportsCardGameHeadline(umbrella, tags);
		}
		if (isDailyUmbrella) {
			return truncateMarketName(dailyTitleWithoutDate);
		}
		const children = umbrella.children;
		if (Array.isArray(children) && children.length === 1) {
			const q = singleMarketQuestions[umbrella._id];
			if (q) {
				return truncateMarketName(
					String(q.displayName || (q as { question?: string }).question || ""),
				);
			}
		}
		if (Array.isArray(children) && children.length >= 2) {
			const md = multiMarketData[umbrella._id];
			const q = md?.questions?.[0];
			if (q) {
				return truncateMarketName(String(q.displayName || q.question || ""));
			}
		}
		return truncateMarketName(umbrella.displayName);
	}, [
		isPandaEsportsListing,
		isDailyUmbrella,
		dailyTitleWithoutDate,
		umbrella,
		tags,
		umbrella.children,
		umbrella._id,
		singleMarketQuestions,
		multiMarketData,
	]);

	const cardHeadlineContent = useMemo((): React.ReactNode => {
		const h = cardHeadline;
		const tail = h.match(/^(.+?)(\s*-\s*Match Winner)\s*$/i);
		if (tail) {
			return (
				<>
					<span className="prediction-card__headline-main">{tail[1]}</span>
					<span className="prediction-card__headline-match-winner">{" - Match Winner"}</span>
				</>
			);
		}
		if (/^match winner$/i.test(h.trim())) {
			return <span className="prediction-card__headline-match-winner">Match Winner</span>;
		}
		return <span className="prediction-card__headline-main">{h}</span>;
	}, [cardHeadline]);

	const renderOutcomeLogoSlot = (index: 0 | 1): React.ReactNode => {
		if (!showTeamLogos || !teamLogos[index]) return null;
		const t = teamLogos[index];
		return (
			<PredictionOutcomeTeamImg
				key={`${umbrella._id}-outcome-${index}`}
				umbrella={umbrella}
				tags={tags}
				teamLogoUrl={t.logoUrl}
				invertRemoteLogo={t.invertLogo}
				displayName={t.displayName}
			/>
		);
	};

	const umbrellaVolumeLabel = formatUmbrellaCrossVenueVolumeLabel(umbrella.volume?.totalUsd);

	const renderActions = () => {
		if (useEsportsMatchWinnerCard && matchWinnerQuestion) {
			// Maps present → matrix: teams as rows, markets (Series, Map 1, …) as
			// columns, team-colored price cells.
			if (esportsOddsRowSpecs.length > 1) {
				return (
					<EsportsMatchMapOddsGrid
						specs={esportsOddsRowSpecs}
						markets={oddsAppState?.markets}
						storeTimestamp={oddsAppState?.timestamp}
						umbrella={umbrella}
						question={matchWinnerQuestion}
						teamALogo={renderOutcomeLogoSlot(0)}
						teamBLogo={renderOutcomeLogoSlot(1)}
						teamAInvertLogo={teamLogos[0]?.invertLogo === true}
						teamBInvertLogo={teamLogos[1]?.invertLogo === true}
						onSelect={navigateToUmbrella}
					/>
				);
			}
			const orderbook = singleMarketOrderbooks[umbrella._id];
			return (
				<SingleMarketActions
					orderbook={orderbook}
					onNavigate={navigateToSingleMarket}
					question={matchWinnerQuestion}
					umbrella={umbrella}
					umbrellaDisplayName={umbrella.displayName}
					liveVenueYesPrice={listingVenueYesNo.yes ?? undefined}
					liveVenueNoPrice={listingVenueYesNo.no ?? undefined}
					compact
					yesLogoSlot={renderOutcomeLogoSlot(0)}
					noLogoSlot={renderOutcomeLogoSlot(1)}
					yesInvertLogo={teamLogos[0]?.invertLogo === true}
					noInvertLogo={teamLogos[1]?.invertLogo === true}
				/>
			);
		}
		if (umbrella.children && umbrella.children.length === 1) {
			const orderbook = singleMarketOrderbooks[umbrella._id];
			const question = singleMarketQuestions[umbrella._id];
			const isDailyPlayerCount = isDailyUmbrella && umbrella.displayName.includes("Player Count");
			return (
				<SingleMarketActions
					orderbook={orderbook}
					onNavigate={navigateToSingleMarket}
					question={question}
					isDailyPlayerCount={isDailyPlayerCount}
					umbrella={umbrella}
					umbrellaDisplayName={umbrella.displayName}
					liveVenueYesPrice={listingVenueYesNo.yes ?? undefined}
					liveVenueNoPrice={listingVenueYesNo.no ?? undefined}
					compact
					yesLogoSlot={renderOutcomeLogoSlot(0)}
					noLogoSlot={renderOutcomeLogoSlot(1)}
					yesInvertLogo={teamLogos[0]?.invertLogo === true}
					noInvertLogo={teamLogos[1]?.invertLogo === true}
				/>
			);
		} else if (umbrella.children && umbrella.children.length >= 2) {
			return (
				<MultiMarketActions
					umbrellaId={umbrella._id}
					multiMarketData={multiMarketData}
					onNavigate={navigateToMultiMarket}
					onNavigateToUmbrella={navigateToUmbrella}
					liveVenueYesPrice={listingVenueYesNo.yes ?? undefined}
					liveVenueNoPrice={listingVenueYesNo.no ?? undefined}
					compact
				/>
			);
		} else {
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

	const dailyWindowEnded = isDailyUmbrella && endDateMs !== null && now >= endDateMs;

	let topLeftStatus: React.ReactNode = null;
	if (isLive) {
		topLeftStatus = (
			<div className="prediction-live-indicator">
				<span className="prediction-live-dot" />
				<span className="prediction-live-text">Live</span>
			</div>
		);
	} else if (dailyWindowEnded || (isEsportsUmbrella && isEnded)) {
		topLeftStatus = <span className="prediction-ended-label">Ended</span>;
	} else if (isDailyUmbrella && endDate !== null && !dailyWindowEnded) {
		topLeftStatus = (
			<CountdownTimer
				target={endDate}
				className="prediction-countdown"
				prefix="Ends In:"
				expiredLabel="Ended"
				showZeroDays={false}
			/>
		);
	} else if (isEsportsUmbrella && isUpcoming && countdownDate !== null) {
		topLeftStatus = (
			<CountdownTimer
				target={countdownDate}
				className="prediction-countdown"
				prefix="Starts In:"
				expiredLabel="Ended"
				showZeroDays={false}
			/>
		);
	}

	const handleCardClick = (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest(".action-button")) {
			return;
		}
		navigateToUmbrella();
	};

	const handleCardPointerIntent = () => {
		preloadPredictionMarketRoute();
	};

	return (
		<div
			key={umbrella._id}
			data-qa="prediction-card"
			data-qa-umbrella-id={umbrella._id}
			data-qa-panda-match-id={umbrella.pandascore_matchId}
			className="prediction-card prediction-card--compact"
			onClick={handleCardClick}
			onMouseEnter={handleCardPointerIntent}
			onFocus={handleCardPointerIntent}
			style={{ cursor: "pointer" }}
		>
			<div className="prediction-card__top prediction-card__top--split">
				<div className="prediction-card__top-status">
					{isDailyUmbrella ? <span className="prediction-card__daily-badge">Daily</span> : null}
					{topLeftStatus}
				</div>
				<div className="prediction-card__top-headline">
					<span className="prediction-card__headline">{cardHeadlineContent}</span>
				</div>
			</div>

			<div className="prediction-actions">{renderActions()}</div>

			{umbrellaVolumeLabel && (useEsportsMatchWinnerCard || umbrella.children?.length === 1) ? (
				<div className="prediction-card__meta prediction-card__top--split">
					<div className="prediction-card__top-status">
						<span className="prediction-card__volume prediction-card__headline-match-winner">
							{umbrellaVolumeLabel}
						</span>
					</div>
					<div className="prediction-card__top-headline" aria-hidden="true" />
				</div>
			) : null}
		</div>
	);
};
