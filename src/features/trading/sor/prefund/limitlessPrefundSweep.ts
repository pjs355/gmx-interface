/**
 * Pure helpers for Limitless Base prefund: SCW → maker USDC sweep sizing vs Li.FI remainder.
 */

/** Floor shortfall USD to micros (6 dp) for ERC-20 transfer amounts. */
export function bridgeShortfallUsdToDesiredSweepMicrosFloor(bridgeShortfallUsd: number): bigint {
	if (!Number.isFinite(bridgeShortfallUsd) || bridgeShortfallUsd <= 0) {
		return 0n;
	}
	const floored = Math.floor(bridgeShortfallUsd * 1_000_000);
	return BigInt(Math.max(0, floored));
}

export type LimitlessSweepPlan = {
	plannedSweepMicros: bigint;
	sweepAmountHuman: number;
	lifiNeedUsd: number;
};

/**
 * Plan SCW→maker sweep micros: never more than bridge shortfall or on-chain balance;
 * omit dust sweeps below `minChunkUsd` and leave the remainder for Li.FI.
 */
export function planLimitlessScwSweepMicros(
	bridgeShortfallUsd: number,
	balanceMicros: bigint,
	minChunkUsd: number,
): LimitlessSweepPlan {
	const shortfall = Math.max(0, bridgeShortfallUsd);
	const desired = bridgeShortfallUsdToDesiredSweepMicrosFloor(shortfall);
	let planned = desired < balanceMicros ? desired : balanceMicros;
	let sweepHuman = Number(planned) / 1e6;
	if (planned > 0n && sweepHuman + 1e-9 < minChunkUsd) {
		planned = 0n;
		sweepHuman = 0;
	}
	const lifiNeedUsd = planned > 0n ? Math.max(0, shortfall - sweepHuman) : shortfall;
	return { plannedSweepMicros: planned, sweepAmountHuman: sweepHuman, lifiNeedUsd };
}

/**
 * Re-cap a planned sweep against a fresh balance read (e.g. before send). Re-applies
 * `minChunkUsd` so a capped-down dust remainder becomes zero sweep and full Li.FI shortfall.
 */
export function recappedSweepForSend(
	plannedSweepMicros: bigint,
	latestBalanceMicros: bigint,
	bridgeShortfallUsd: number,
	minChunkUsd: number,
): LimitlessSweepPlan {
	let capped = plannedSweepMicros < latestBalanceMicros ? plannedSweepMicros : latestBalanceMicros;
	let sweepHuman = Number(capped) / 1e6;
	if (capped > 0n && sweepHuman + 1e-9 < minChunkUsd) {
		capped = 0n;
		sweepHuman = 0;
	}
	const shortfall = Math.max(0, bridgeShortfallUsd);
	const lifiNeedUsd = capped > 0n ? Math.max(0, shortfall - sweepHuman) : shortfall;
	return {
		plannedSweepMicros: capped,
		sweepAmountHuman: sweepHuman,
		lifiNeedUsd,
	};
}

/** User-facing / bridge-result copy when the SCW USDC transfer simulation fails. */
export function isLimitlessSweepInsufficientBalanceError(e: unknown): boolean {
	const t = e instanceof Error ? `${e.name} ${e.message}` : String(e);
	const m = t.toLowerCase();
	return (
		m.includes("transfer amount exceeds balance") ||
		m.includes("exceeds balance") ||
		m.includes("erc20: transfer amount exceeds balance")
	);
}
