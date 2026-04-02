/** Remove leading "umbrella" token some catalogs embed in display names (e.g. `umbrellaGTA VI…`). */
export function stripUmbrellaDisplayPrefix(
	name: string | undefined | null
): string {
	if (!name) return "";
	return name.replace(/^umbrella\s*/i, "").trim();
}

/**
 * Extracts the "TeamA vs TeamB" core from a market title, stripping game
 * prefixes (e.g. "Counter-Strike: "), tournament suffixes, BO tags, etc.
 * Returns null for non-VS titles.
 */
export function extractVsCore(title: string): string | null {
	const lower = title.toLowerCase();
	const noPrefix = lower.replace(/^[^:]+:\s*/, "");
	const m = noPrefix.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s*[\(\-\?]|$)/);
	if (!m) return null;
	return `${m[1].trim()} vs ${m[2].trim()}`;
}

/**
 * Checks whether an umbrella display-name and a venue market title refer
 * to the same event.  Uses three strategies:
 *   1. Full substring match
 *   2. Substring match after stripping parenthetical content
 *   3. VS-core equality (e.g. "ecstatic vs ursa" from both sides)
 */
export function titlesMatchVenue(umbrellaName: string, venueTitle: string): boolean {
	const a = umbrellaName.toLowerCase();
	const b = venueTitle.toLowerCase();
	if (b.includes(a) || a.includes(b.replace(/\s*\(.*\)/, ""))) return true;
	const coreA = extractVsCore(umbrellaName);
	const coreB = extractVsCore(venueTitle);
	if (coreA && coreB && coreA === coreB) return true;
	return false;
}
