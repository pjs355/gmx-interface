import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import { resolveTeamLogo } from "@/config/team-map";

/**
 * Resolve a team's logo URL from its umbrella mapping. Prefers the explicit
 * `logoUrl`, then falls back to the bundled team-map by shortCode / slug /
 * displayName. Shared by the home cards ({@link PredictionCard}) and the
 * trading-page chart match header so both stay in sync.
 */
export function resolveTeamLogoUrl(
	team: UmbrellaTeamMapping | null | undefined,
): string | undefined {
	if (!team) return undefined;
	if (team.logoUrl) return team.logoUrl;
	if (team.shortCode) {
		const resolved = resolveTeamLogo(team.shortCode);
		if (resolved) return resolved;
	}
	if (team.slug) {
		const resolved = resolveTeamLogo(team.slug);
		if (resolved) return resolved;
	}
	if (team.displayName) {
		const resolved = resolveTeamLogo(team.displayName);
		if (resolved) return resolved;
	}
	return undefined;
}
