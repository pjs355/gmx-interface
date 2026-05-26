import type { AccountPositionsMap, AccountRemoteVenueKey } from "@/context/AccountDataContext";
import {
	shareIdentityForVenuePosition,
	CASH_CONVERGENCE_TOL_USD,
} from "@/features/trading/sor/post-trade/postTradeBaseline";
import type { VenuePosition } from "@/types/trading/venuePosition";

const POSITION_SIG_EPS = 1e-6;

export type AccountReconcileSnapshot = {
	accountVersion: number;
	cashTotal: number;
	/** Sorted venue rows → stable string for equality-ish compare. */
	venuePositionSigs: Record<AccountRemoteVenueKey, string>;
	levelUpYes: number | null;
	levelUpNo: number | null;
};

function venueRowsSignature(rows: VenuePosition[]): string {
	const parts: string[] = [];
	for (const r of rows) {
		const id = shareIdentityForVenuePosition(r);
		if (!id) continue;
		parts.push(`${id}:${r.shares.toFixed(4)}`);
	}
	parts.sort();
	return parts.join("|");
}

export function captureAccountReconcileSnapshot(input: {
	positions: AccountPositionsMap | Record<AccountRemoteVenueKey, { rows: VenuePosition[] }>;
	cashTotal: number;
	accountVersion: number;
	readLevelUpSide: (marketId: string, side: "yes" | "no") => number;
	levelUpMarketId: string | null;
}): AccountReconcileSnapshot {
	const venues: AccountRemoteVenueKey[] = ["polymarket", "predict", "dflow", "limitless"];
	const venuePositionSigs = {} as Record<AccountRemoteVenueKey, string>;
	for (const v of venues) {
		venuePositionSigs[v] = venueRowsSignature(input.positions[v].rows);
	}
	const mid = input.levelUpMarketId?.trim() ?? "";
	return {
		accountVersion: input.accountVersion,
		cashTotal: input.cashTotal,
		venuePositionSigs,
		levelUpYes: mid ? input.readLevelUpSide(mid, "yes") : null,
		levelUpNo: mid ? input.readLevelUpSide(mid, "no") : null,
	};
}

export function evidenceSnapshotChanged(
	before: AccountReconcileSnapshot,
	after: AccountReconcileSnapshot,
): boolean {
	if (
		Number.isFinite(after.cashTotal) &&
		Number.isFinite(before.cashTotal) &&
		Math.abs(after.cashTotal - before.cashTotal) > CASH_CONVERGENCE_TOL_USD * 2
	) {
		return true;
	}
	const venues: AccountRemoteVenueKey[] = ["polymarket", "predict", "dflow", "limitless"];
	for (const v of venues) {
		if (after.venuePositionSigs[v] !== before.venuePositionSigs[v]) return true;
	}
	for (const side of ["levelUpYes", "levelUpNo"] as const) {
		const a = after[side];
		const b = before[side];
		if (a == null && b == null) continue;
		if (a == null || b == null) return true;
		if (Math.abs(a - b) > POSITION_SIG_EPS) return true;
	}
	return false;
}
