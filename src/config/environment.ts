/**
 * Centralized Environment Configuration for LevelUp Predictions
 * 
 * This is the SINGLE SOURCE OF TRUTH for environment detection.
 * All other config files (addresses, API URLs, RPC) should import from here.
 * 
 * Environment modes:
 * - TESTNET: Uses testnet contract addresses + localhost API (for local development)
 * - PRODUCTION: Uses live contract addresses + production API (for deployed app)
 */

export type Environment = "testnet" | "production";

/**
 * Determines the current environment.
 * 
 * Logic:
 * 1. Check localStorage override (for manual testing)
 * 2. Check if running on localhost → testnet
 * 3. Otherwise → production
 */
export function getEnvironment(): Environment {
	// Check for manual override in localStorage (useful for testing production locally)
	if (typeof window !== "undefined") {
		const override = localStorage.getItem("levelup_environment");
		if (override === "testnet" || override === "production") {
			return override;
		}
	}

	// Auto-detect based on hostname
	if (typeof window !== "undefined") {
		const hostname = window.location.hostname;
		if (hostname === "localhost" || hostname === "127.0.0.1") {
			return "testnet";
		}
	}

	// Default to production for deployed environments
	return "production";
}

/**
 * Check if currently in testnet mode
 */
export function isTestnet(): boolean {
	return getEnvironment() === "testnet";
}

/**
 * Check if currently in production mode
 */
export function isProduction(): boolean {
	return getEnvironment() === "production";
}

/**
 * Manually set the environment (persists in localStorage)
 * Useful for testing production config locally or vice versa
 */
export function setEnvironment(env: Environment): void {
	if (typeof window !== "undefined") {
		localStorage.setItem("levelup_environment", env);
		// Reload to apply changes across all modules
		window.location.reload();
	}
}

/**
 * Clear the manual environment override (revert to auto-detection)
 */
export function clearEnvironmentOverride(): void {
	if (typeof window !== "undefined") {
		localStorage.removeItem("levelup_environment");
		window.location.reload();
	}
}

/**
 * Get a human-readable label for the current environment
 */
export function getEnvironmentLabel(): string {
	const env = getEnvironment();
	const isOverridden = typeof window !== "undefined" && 
		localStorage.getItem("levelup_environment") !== null;
	
	if (isOverridden) {
		return `${env.toUpperCase()} (manual override)`;
	}
	return env.toUpperCase();
}

