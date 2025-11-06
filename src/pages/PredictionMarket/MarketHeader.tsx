import React, { useMemo, useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaVIImage from "@/assets/img/ic_gtaVI_40.svg";
import { resolveUmbrellaIconById } from "@/helpers/gameLogoResolver";
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

	// Priority 1: Use umbrella's uploaded image (image1Url or image2Url)
	const umbrellaImage =
		(umbrella as any).image1Url || (umbrella as any).image2Url || null;

	// Priority 2: Get tag image from first question's tagIds
	const tagImage = useMemo(() => {
		const children = (umbrella as any).children;
		if (!Array.isArray(children) || children.length === 0) return null;

		const firstQuestion = children[0];
		const tagIds: string[] | undefined = firstQuestion?.tagIds;

		if (!Array.isArray(tagIds) || tagIds.length === 0) return null;

		// Find the first tag that has an imageUrl
		for (const tagId of tagIds) {
			const tag = tags.find((t) => t._id === tagId);
			if (tag?.imageUrl) return tag.imageUrl;
		}

		return null;
	}, [umbrella, tags]);

	// Priority 3: Fallback to game controller
	const fallbackLogo = gtaVIImage;

	// Determine initial source
	const initialSrc = umbrellaImage || tagImage || fallbackLogo;

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
			// Try fallback order: tagImage → gtaVIImage
			if (currentSrc !== tagImage && tagImage) {
				setCurrentSrc(tagImage);
			} else {
				setCurrentSrc(fallbackLogo);
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
