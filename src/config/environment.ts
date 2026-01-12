/**
 * Centralized Environment Configuration for LevelUp Predictions
 * 
 * This is the SINGLE SOURCE OF TRUTH for environment detection.
 * All other config files (addresses, API URLs, RPC) should import from here.
 * 
 * Environment modes:
 * - TESTNET: Uses testnet contract addresses + localhost API (for local development)
 * - PRODUCTION: Uses live contract addresses + production API (for deployed app)
 * 
 * Priority order for environment detection:
 * 1. VITE_ENVIRONMENT_MODE env variable (set by yarn dev prompt)
 * 2. localStorage override (for manual testing in browser)
 * 3. Auto-detect based on hostname (localhost = testnet, otherwise = production)
 */

export type Environment = "testnet" | "production";

/**
 * Get the environment mode set at build/dev time via VITE_ENVIRONMENT_MODE
 */
function getBuildTimeEnvironment(): Environment | null {
	const envMode = import.meta.env.VITE_ENVIRONMENT_MODE;
	if (envMode === "testnet" || envMode === "production") {
		return envMode;
	}
	return null;
}

/**
 * Determines the current environment.
 * 
 * Logic (PRODUCTION SAFE - no localStorage override):
 * 1. Check VITE_ENVIRONMENT_MODE (set by dev script prompt)
 * 2. Check if running on localhost → testnet
 * 3. Otherwise → production (ALWAYS for deployed environments)
 * 
 * NOTE: localStorage override was REMOVED to prevent accidental
 * environment switching in production which caused critical bugs.
 */
export function getEnvironment(): Environment {
	// Priority 1: Build/dev time environment variable
	const buildTimeEnv = getBuildTimeEnvironment();
	if (buildTimeEnv) {
		return buildTimeEnv;
	}

	// Priority 2: Auto-detect based on hostname
	// Only localhost gets testnet - deployed sites ALWAYS get production
	if (typeof window !== "undefined") {
		const hostname = window.location.hostname;
		if (hostname === "localhost" || hostname === "127.0.0.1") {
			return "testnet";
		}
	}

	// Default to production for deployed environments - NO EXCEPTIONS
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
 * Manually set the environment - DISABLED IN PRODUCTION
 * This function is only useful for local development.
 * On production, environment changes are NOT allowed for security.
 * @deprecated Use VITE_ENVIRONMENT_MODE for environment switching
 */
export function setEnvironment(_env: Environment): void {
	// DISABLED - environment switching caused critical production bugs
	// Environment is now determined solely by hostname and build-time config
	console.warn("setEnvironment is disabled. Environment is determined by hostname.");
}

/**
 * Clear the manual environment override - DISABLED IN PRODUCTION
 * @deprecated No longer needed since localStorage override is disabled
 */
export function clearEnvironmentOverride(): void {
	// DISABLED - clean up any leftover localStorage just in case
	if (typeof window !== "undefined") {
		localStorage.removeItem("levelup_environment");
	}
	console.warn("clearEnvironmentOverride is disabled. Environment is determined by hostname.");
}

/**
 * Get a human-readable label for the current environment
 */
export function getEnvironmentLabel(): string {
	const env = getEnvironment();
	
	// Check if set via dev script
	const buildTimeEnv = getBuildTimeEnvironment();
	if (buildTimeEnv) {
		return `${env.toUpperCase()} (dev mode)`;
	}
	
	return env.toUpperCase();
}

