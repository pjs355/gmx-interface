import React, { useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import { usePredictionData } from "@/context/PredictionDataContext";

type MarketHeaderProps = {
	umbrella: Umbrella;
	titleRef: React.RefObject<HTMLHeadingElement>;
};

export const MarketHeader: React.FC<MarketHeaderProps> = ({
	umbrella,
	titleRef,
}) => {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	// Priority 1: Check for server image (ic_{umbrellaID})
	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;

	// Priority 2: Check for tag imageUrl from tags
	const tagImage = getTagImageFromUmbrella(umbrella, tags);

	// Priority 3: Check for game logo based on tag labels
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);

	// Priority 4: Fallback to game controller
	const fallbackLogo = gameLogo || gtaIcon;

	// Determine initial source
	const initialSrc = serverImage || tagImage || fallbackLogo;

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

	return (
		<div className="market-header">
			<div className="market-title-container">
				<img
					src={currentSrc || initialSrc}
					alt="Umbrella"
					className="market-image"
					onError={handleError}
				/>
				<h1
					ref={titleRef}
					className="mb-16 text-34 font-bold"
					style={{ color: "white" }}
				>
					{umbrella.displayName}
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
