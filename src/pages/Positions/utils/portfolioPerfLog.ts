/**
 * Positions page diagnostics (quiet by default).
 *
 * - `VITE_DEBUG_PORTFOLIO_PERF=1` — `[PortfolioPerf]` + READY (deduped JSON fingerprint).
 * - `VITE_DEBUG_POSITIONS_LOADING=1` — `[PositionsLoadingGate]` (deduped on blocker strings).
 * - `VITE_DEBUG_VENUE_HISTORY_SOURCES=1` — `[venueHistorySources]` counts.
 * - `VITE_DEBUG_FULL_HISTORY_RESOLVE=1` — `[FULL_HISTORY_RESOLVE]` (resolve failures still log in dev).
 * - `VITE_DEBUG_LIMITLESS_PORTFOLIO=1` — `[LimitlessPortfolio]` traces.
 * - `VITE_DEBUG_PREDICT_ORDERS=1` — `[PredictOrders]` cost-basis hints.
 * - `VITE_DEBUG_PREDICT_UMBRELLA=1` — `[predict-umbrella:*]` resolver traces.
 *
 * History tab (`fullHistoryDebugLog.ts`): `[History] FULL_HISTORY` and `UMBRELLAS_FULL` run in
 * dev only, once per stable fingerprint, inside `console.groupCollapsed` for readability.
 */

let positionsMountPerfMs: number | null = null;

let lastPortfolioLoadFingerprint = "";

export function portfolioPerfEnabled(): boolean {
	return import.meta.env.VITE_DEBUG_PORTFOLIO_PERF === "1";
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

/** Log when the loading snapshot changes (deduped — same payload string skips repeat). */
export function logPortfolioLoadState(payload: Record<string, unknown>): void {
	if (!portfolioPerfEnabled()) return;
	const body = { tMsSincePositionsMount: msSincePositionsMount(), ...payload };
	let fp: string;
	try {
		fp = JSON.stringify(body);
	} catch {
		fp = String(payload.isDataFullyLoaded);
	}
	if (fp === lastPortfolioLoadFingerprint) return;
	lastPortfolioLoadFingerprint = fp;
	console.log("[PortfolioPerf]", body);
}

/** Once when isDataFullyLoaded becomes true — include bounded snapshot for reconciliation debugging. */
export function logPortfolioReadySnapshot(payload: Record<string, unknown>): void {
	if (!portfolioPerfEnabled()) return;
	console.log("[PortfolioPerf] READY", { tMsSincePositionsMount: msSincePositionsMount(), ...payload });
}

/**
 * Verbose Positions/History gate dumps — opt-in `VITE_DEBUG_POSITIONS_LOADING=1` only.
 */
export function positionsLoadingGateDiagEnabled(): boolean {
	return import.meta.env.VITE_DEBUG_POSITIONS_LOADING === "1";
}

let lastPositionsGateFingerprint = "";

export function logPositionsLoadingGateState(payload: Record<string, unknown>): void {
	if (!positionsLoadingGateDiagEnabled()) return;
	const gates = (payload.gates ?? {}) as Record<string, unknown>;
	const fp = [
		String(payload.blockersText ?? ""),
		String(payload.positionsShellBlockersText ?? ""),
		String(payload.historyShellBlockersText ?? ""),
		JSON.stringify(gates),
	].join("|");
	if (fp === lastPositionsGateFingerprint) return;
	lastPositionsGateFingerprint = fp;
	console.info("[PositionsLoadingGate]", {
		tMsSincePositionsMount: msSincePositionsMount(),
		...payload,
	});
}
