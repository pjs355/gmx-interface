/**
 * Resolves venue/market logos (LevelUp, Predict, Polymarket, Kalshi, Limitless) by id/label.
 * Files live in `src/assets/market-logos/` and are loaded eagerly via Vite glob, same pattern as
 * `gameLogoResolver`.
 */

const logoModules = import.meta.glob(
	"@/assets/market-logos/*.{png,jpg,jpeg,svg,webp}",
	{ eager: true, as: "url" },
) as Record<string, string>;

const LOGO_BY_BASENAME: Record<string, string> = {};
for (const [path, url] of Object.entries(logoModules)) {
	const fileName = path.split("/").pop() || "";
	const base = fileName.replace(/\.[^.]+$/, "").toLowerCase();
	LOGO_BY_BASENAME[base] = url;
}

/** Synonyms → canonical basename in `src/assets/market-logos/`. */
const VENUE_TO_BASENAME: Record<string, string> = {
	levelup: "levelup",
	predict: "predict",
	predictfun: "predict",
	"predict.fun": "predict",
	polymarket: "polymarket",
	poly: "polymarket",
	kalshi: "kalshi",
	dflow: "kalshi",
	limitless: "limitless",
};

/** Returns the square logo URL for a known venue, or null. */
export function resolveMarketLogo(venue: string | null | undefined): string | null {
	if (!venue) return null;
	const key = String(venue).trim().toLowerCase();
	if (!key) return null;
	const baseName = VENUE_TO_BASENAME[key];
	if (baseName && LOGO_BY_BASENAME[baseName]) return LOGO_BY_BASENAME[baseName];
	return null;
}
