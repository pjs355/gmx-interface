import React, { useMemo, useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaVIImage from "@/assets/img/ic_gtaVI_40.svg";
import {
	resolveLogoWithPriority,
	collectTagsFromUmbrella,
	resolveUmbrellaIconById,
} from "../utils/gameLogoResolver";

type MarketHeaderProps = {
	umbrella: Umbrella;
	titleRef: React.RefObject<HTMLHeadingElement>;
};

export const MarketHeader: React.FC<MarketHeaderProps> = ({
	umbrella,
	titleRef,
}) => {
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	// Priority 1: Check for server image (ic_{umbrellaID})
	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;

	// Priority 2: Check for game logo based on tags
	const gameLogo = useMemo(() => {
		const tags = collectTagsFromUmbrella(umbrella);
		return resolveLogoWithPriority(umbrella, tags);
	}, [umbrella]);

	// Priority 3: Fallback to game controller
	const fallbackLogo = gameLogo || gtaVIImage;

	// Determine initial source
	const initialSrc = serverImage || fallbackLogo;

	const handleError = () => {
		if (!imageError && serverImage && gameLogo) {
			// If server image fails, fall back to game logo
			setImageError(true);
			setCurrentSrc(gameLogo);
		} else if (!imageError && serverImage && !gameLogo) {
			// If server image fails and no game logo, fall back to controller
			setImageError(true);
			setCurrentSrc(gtaVIImage);
		}
	};

	return (
		<div style={{ marginBottom: 8 }}>
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
		</div>
	);
};
