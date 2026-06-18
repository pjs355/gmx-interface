/**
 * Canonical site / link-preview metadata.
 * `index.html` uses placeholders filled by `scripts/viteSiteMetadataHtml.ts` at build/dev.
 */
/** Production origin (clutchcomet.com). */
export const SITE_ORIGIN = "https://clutchcomet.com";

export const SITE_NAME = "ClutchComet";

/** Default `<title>` for the homepage and app shell fallback. */
export const SITE_TITLE = "ClutchComet | Prediction Market Aggregator";

export const SITE_DESCRIPTION =
	"ClutchComet is a prediction market aggregator. Compare nine venues on matched events, trade Polymarket, Kalshi, Limitless, and Predict from one balance, with smart order routing.";

export const SITE_KEYWORDS =
	"prediction market aggregator, compare prediction markets, Polymarket Kalshi aggregator, esports prediction markets, smart order routing, line shopping";

export const AGGREGATOR_HUB_PATH = "/blog/what-is-a-prediction-market-aggregator";

export const ESPORTS_AGGREGATOR_HUB_PATH = "/blog/esports-prediction-market-aggregator";

export const SITE_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

/** Dimensions of `public/og-image.png` (generated from `ClutchCometColored.png`). */
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 630;

export const SITE_OG_IMAGE_ALT =
	"ClutchComet prediction market aggregator: compare and trade Polymarket, Kalshi, Limitless, and Predict from one screen.";

export const SITE_FAVICON = "/favicon.png";

export const TWITTER_SITE = "@Clutch_Comet";

export const TWITTER_URL = "https://x.com/Clutch_Comet";
