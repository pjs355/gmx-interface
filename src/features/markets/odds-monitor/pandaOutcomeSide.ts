import type { MatchedMarket } from "@/types/odds-monitor";

function norm(s: string): string {
	return s.trim().toLowerCase();
}

/**
 * Map trade-box YES/NO (with display labels) to OddsMonitor Panda side A or B.
 *
 * Compares the selected outcome label to `pandaTeamA` / `pandaTeamB` on the
 * matched row. When labels do not match (missing or renamed), falls back to
 * YES → A and NO → B.
 *
 * Venue-specific book/token resolution stays in each venue module; this only
 * picks A vs B.
 */
export function pandaOutcomeSide(
	matched: MatchedMarket,
	position: "yes" | "no",
	yesTeamLabel: string,
	noTeamLabel: string,
): "A" | "B" {
	const label = norm(position === "yes" ? yesTeamLabel : noTeamLabel);
	const a = norm(matched.pandaTeamA);
	const b = norm(matched.pandaTeamB);

	if (label === a) return "A";
	if (label === b) return "B";

	return position === "yes" ? "A" : "B";
}
