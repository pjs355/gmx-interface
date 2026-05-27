/**
 * Dev / deploy **API routing** modes. Contract addresses are always production Base
 * mainnet (`config/addresses.ts`) — not controlled here.
 *
 * - **local** ([2] LOCAL): private + order API → localhost:8080
 * - **local-production** ([3] DEV): public catalog often Railway; unified :8080 when dev-prompt sets override
 * - **production** ([1] LIVE / deployed): Railway API
 */

export type Environment = "local" | "production" | "local-production";

function normalizeBuildTimeMode(raw: string | undefined): Environment | null {
	const mode = raw?.trim();
	if (mode === "production") return "production";
	if (mode === "local") return "local";
	if (mode === "local-production") return "local-production";
	/** @deprecated Legacy name for local API mode — not test contracts */
	if (mode === "testnet") return "local";
	return null;
}

function getBuildTimeEnvironment(): Environment | null {
	return normalizeBuildTimeMode(import.meta.env.VITE_ENVIRONMENT_MODE);
}

export function getEnvironment(): Environment {
	const buildTimeEnv = getBuildTimeEnvironment();
	if (buildTimeEnv) {
		return buildTimeEnv;
	}

	if (typeof window !== "undefined") {
		const hostname = window.location.hostname;
		if (hostname === "localhost" || hostname === "127.0.0.1") {
			return "local";
		}
	}

	return "production";
}

/** Local predictions-api on loopback (`local` or `local-production`). */
export function isLocalApi(): boolean {
	const env = getEnvironment();
	return env === "local" || env === "local-production";
}

export function isProduction(): boolean {
	return getEnvironment() === "production";
}

export function setEnvironment(_env: Environment): void {
	console.warn("setEnvironment is disabled. Environment is determined by hostname.");
}

export function clearEnvironmentOverride(): void {
	if (typeof window !== "undefined") {
		localStorage.removeItem("levelup_environment");
	}
	console.warn("clearEnvironmentOverride is disabled.");
}

export function getEnvironmentLabel(): string {
	const env = getEnvironment();
	const buildTimeEnv = getBuildTimeEnvironment();
	if (buildTimeEnv) {
		return `${env.toUpperCase()} (dev mode)`;
	}
	return env.toUpperCase();
}
