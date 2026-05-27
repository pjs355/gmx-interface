/**
 * Canonical site / link-preview metadata.
 * `index.html` uses placeholders filled by `scripts/viteSiteMetadataHtml.ts` at build/dev.
 */
/** Production origin (ClutchComent.com). */
export const SITE_ORIGIN = "https://clutchcoment.com";

export const SITE_NAME = "ClutchComet";

export const SITE_TITLE = "ClutchComet | Prediction market aggregator";

export const SITE_DESCRIPTION =
	"Trade on Polymarket, Kalshi, Predict, Limitless, and LevelUp from one screen. Smart order routing finds the best price across venues.";

export const SITE_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

/** Dimensions of `public/og-image.png` (generated from `ClutchCometColored.png`). */
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 630;

export const SITE_OG_IMAGE_ALT =
	"ClutchComet: trade prediction markets across Polymarket, Kalshi, Predict, Limitless, and LevelUp with smart order routing.";

export const SITE_FAVICON = "/favicon.png";

export const TWITTER_SITE = "@Clutch_Comet";

export const TWITTER_URL = "https://x.com/Clutch_Comet";
