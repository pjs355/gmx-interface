/**
 * Dev / opt-in performance logging for the Positions page.
 * Set VITE_DEBUG_PORTFOLIO_PERF=1 to enable in production builds.
 */

let positionsMountPerfMs: number | null = null;

export function portfolioPerfEnabled(): boolean {
	return import.meta.env.DEV || import.meta.env.VITE_DEBUG_PORTFOLIO_PERF === "1";
}

/** Call from Positions.tsx on mount (e.g. useLayoutEffect). */
export function markPositionsPageMount(): void {
	positionsMountPerfMs = performance.now();
}

function msSincePositionsMount(): number {
	if (positionsMountPerfMs === null) return 0;
	return Math.round(performance.now() - positionsMountPerfMs);
}

export function truncateWallet(addr: string | null | undefined): string {
	if (!addr || addr.length < 10) return addr ?? "(none)";
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Log each time the loading gate fingerprint changes. */
export function logPortfolioLoadState(payload: Record<string, unknown>): void {
	if (!portfolioPerfEnabled()) return;
	console.log("[PortfolioPerf]", { tMsSincePositionsMount: msSincePositionsMount(), ...payload });
}

/** Once when isDataFullyLoaded becomes true — include bounded snapshot for reconciliation debugging. */
export function logPortfolioReadySnapshot(payload: Record<string, unknown>): void {
	if (!portfolioPerfEnabled()) return;
	console.log("[PortfolioPerf] READY", { tMsSincePositionsMount: msSincePositionsMount(), ...payload });
}
