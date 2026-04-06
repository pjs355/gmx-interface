import { useState } from "react";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import { usePredictionData } from "@/context/PredictionDataContext";

export default function UmbrellaImage({
	umbrella,
	size = 48,
}: {
	umbrella: any;
	size?: number;
}) {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const polyIcon = umbrella?._polyIcon || null;
	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;
	const tagImage = getTagImageFromUmbrella(umbrella, tags);
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);
	const fallbackLogo = gameLogo || gtaIcon;
	const initialSrc = polyIcon || serverImage || tagImage || fallbackLogo;

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
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
		<img
			src={currentSrc || initialSrc}
			alt="umbrella"
			width={size}
			height={size}
			style={{
				display: "block",
				background: "#000",
				borderRadius: 8,
				objectFit: "contain",
			}}
			onError={handleError}
		/>
	);
}
