import { useState } from "react";

import { getAvatarColor, getInitials } from "./format";

interface TraderAvatarProps {
	wallet: string;
	displayName: string;
	imageUrl?: string | null;
	size: number;
}

/**
 * Round avatar. Uses the Polymarket profile image when available; falls back
 * to deterministic colored initials keyed on the wallet address.
 */
export function TraderAvatar({ wallet, displayName, imageUrl, size }: TraderAvatarProps) {
	const [broken, setBroken] = useState(false);
	const showImage = imageUrl && !broken;
	const bg = getAvatarColor(wallet);
	const initials = getInitials(displayName, wallet);
	const style = {
		width: size,
		height: size,
		background: showImage ? "#14161b" : bg,
		fontSize: Math.round(size * 0.4),
	} as const;

	if (showImage) {
		return (
			<span className="traders-avatar" style={style} aria-hidden="true">
				<img
					src={imageUrl ?? undefined}
					alt=""
					width={size}
					height={size}
					loading="lazy"
					onError={() => setBroken(true)}
				/>
			</span>
		);
	}

	return (
		<span className="traders-avatar" style={style} aria-hidden="true">
			{initials}
		</span>
	);
}
