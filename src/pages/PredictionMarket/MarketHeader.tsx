import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { RiArrowLeftSLine } from "react-icons/ri";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.jpg";
import {
	bundledCounterStrikeLogoFromTagLabels,
	bundledWorldCupLogoFromUmbrella,
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/features/markets/assets/gameLogoResolver";
import { usePredictionData } from "@/context/PredictionDataContext";
import { formatUmbrellaTitleForTradingPage } from "@/features/markets/presentation/umbrellaDisplayName";

type MarketHeaderProps = {
	umbrella: Umbrella;
	titleRef: React.RefObject<HTMLHeadingElement>;
};

export const MarketHeader: React.FC<MarketHeaderProps> = ({ umbrella, titleRef }) => {
	const { tags } = usePredictionData();
	const navigate = useNavigate();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const goBack = () => {
		// Fall back to the markets list when there is no in-app history (deep link).
		if (window.history.length > 1) {
			navigate(-1);
		} else {
			navigate("/");
		}
	};

	// Priority 1: Check for server image (ic_{umbrellaID})
	const serverImage = umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;

	// Priority 2: Check for tag imageUrl from tags
	const tagImage = getTagImageFromUmbrella(umbrella, tags);

	// Priority 3: Check for game logo based on tag labels
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);

	// Priority 4: Fallback to game controller
	const fallbackLogo = gameLogo || gtaIcon;

	const worldCupBundled = bundledWorldCupLogoFromUmbrella(umbrella);
	const cs2Bundled = bundledCounterStrikeLogoFromTagLabels(tagLabels);
	// Determine initial source
	const initialSrc = worldCupBundled ?? cs2Bundled ?? (serverImage || tagImage || fallbackLogo);

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
			// Try fallback order: tagImage → gameLogo → gtaIcon
			if (currentSrc !== tagImage && tagImage) {
				setCurrentSrc(tagImage);
			} else if (currentSrc !== gameLogo && gameLogo) {
				setCurrentSrc(gameLogo);
			} else {
				setCurrentSrc(gtaIcon);
			}
		}
	};

	// Process title to remove dates for daily/player count markets
	const displayTitle = useMemo(() => {
		let title = formatUmbrellaTitleForTradingPage(umbrella);

		// Check if this is a player count market
		if (title.includes("Player Count")) {
			// Remove ISO date format (YYYY-MM-DD) from the end
			title = title.replace(/\s+\d{4}-\d{2}-\d{2}\s*$/, "");

			// Remove other common date formats
			// "December 9, 2025" or "Dec 9, 2025"
			title = title.replace(/\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4}\s*$/, "");
			// "12/9/2025" or "12-9-2025"
			title = title.replace(/\s+\d{1,2}[-/]\d{1,2}[-/]\d{4}\s*$/, "");

			title = title.trim();
		}

		return title || formatUmbrellaTitleForTradingPage(umbrella);
	}, [umbrella.displayName, umbrella.game]);

	return (
		<div className="market-header">
			<button
				type="button"
				className="market-back-btn"
				aria-label="Back to markets"
				onClick={goBack}
			>
				<RiArrowLeftSLine />
			</button>
			<div className="market-title-container">
				<img
					src={currentSrc || initialSrc}
					alt="Umbrella"
					className="market-image"
					onError={handleError}
				/>
				<h1 ref={titleRef} className="mb-16 text-34 font-bold" style={{ color: "white" }}>
					{displayTitle}
				</h1>
				{umbrella.description && (
					<p
						style={{
							color: "#888",
							fontSize: "16px",
							marginTop: "8px",
						}}
					>
						{umbrella.description}
					</p>
				)}
			</div>
		</div>
	);
};
