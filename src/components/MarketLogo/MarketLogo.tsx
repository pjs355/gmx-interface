import { resolveMarketLogo } from "@/helpers/marketLogoResolver";

interface MarketLogoProps {
	/** Venue id/label (predict, predictfun, polymarket, poly, kalshi, dflow, limitless, levelup). */
	venue: string | null | undefined;
	/** Pixel size for both width & height. Defaults to 16 to fit alongside text without changing layout. */
	size?: number;
	className?: string;
	/** Optional accessible label override. Defaults to the resolved venue id. */
	alt?: string;
	style?: React.CSSProperties;
}

/**
 * Inline venue logo with slightly rounded corners. Renders nothing when the venue is unknown
 * so callers can safely drop it next to a name without disturbing layout.
 */
export default function MarketLogo({
	venue,
	size = 16,
	className,
	alt,
	style,
}: MarketLogoProps) {
	const src = resolveMarketLogo(venue);
	if (!src) return null;
	return (
		<img
			src={src}
			alt={alt ?? String(venue ?? "venue")}
			width={size}
			height={size}
			className={className}
			style={{
				width: size,
				height: size,
				borderRadius: Math.max(2, Math.round(size * 0.2)),
				objectFit: "cover",
				flexShrink: 0,
				display: "inline-block",
				verticalAlign: "middle",
				...style,
			}}
		/>
	);
}
