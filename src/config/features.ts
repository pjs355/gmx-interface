// Feature flags for the application
export const RPG_ENABLED = false;

export const FEATURES = {
	RPG: RPG_ENABLED,
} as const;

export function isFeatureEnabled(feature: keyof typeof FEATURES): boolean {
	return FEATURES[feature];
}
