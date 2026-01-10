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
 * Logic:
 * 1. Check VITE_ENVIRONMENT_MODE (set by dev script prompt)
 * 2. Check localStorage override (for manual testing)
 * 3. Check if running on localhost → testnet
 * 4. Otherwise → production
 */
export function getEnvironment(): Environment {
	// Priority 1: Build/dev time environment variable
	const buildTimeEnv = getBuildTimeEnvironment();
	if (buildTimeEnv) {
		return buildTimeEnv;
	}

	// Priority 2: Manual override in localStorage (useful for testing)
	if (typeof window !== "undefined") {
		const override = localStorage.getItem("levelup_environment");
		if (override === "testnet" || override === "production") {
			return override;
		}
	}

	// Priority 3: Auto-detect based on hostname
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
	
	// Check if set via dev script
	const buildTimeEnv = getBuildTimeEnvironment();
	if (buildTimeEnv) {
		return `${env.toUpperCase()} (dev mode)`;
	}
	
	// Check if manually overridden via localStorage
	const isOverridden = typeof window !== "undefined" && 
		localStorage.getItem("levelup_environment") !== null;
	
	if (isOverridden) {
		return `${env.toUpperCase()} (manual override)`;
	}
	return env.toUpperCase();
}

