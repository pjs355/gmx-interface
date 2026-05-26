import type { VenuePosition } from "@/types/trading/venuePosition";
import type { LevelUpMarketMeta } from "./buildLevelUpMarketMetaMap";
import type { LevelUpTokenBalance } from "./levelUpTokenBalanceTypes";

function parseShareCount(raw: string | number | undefined): number {
	if (raw === undefined) return 0;
	const n = typeof raw === "number" ? raw : Number.parseFloat(raw);
	return Number.isFinite(n) ? n : 0;
}

function outcomeLabel(side: "yes" | "no"): "Yes" | "No" {
	return side === "yes" ? "Yes" : "No";
}

/** Post-trade / trade-box share read from normalised LevelUp rows. */
export function readLevelUpSideShares(
	rows: readonly VenuePosition[],
	marketId: string,
	side: "yes" | "no",
): number {
	const mid = marketId.trim();
	if (!mid) return 0;
	const want = outcomeLabel(side);
	for (const row of rows) {
		if (row.venue !== "levelup") continue;
		if (String(row.conditionId ?? "").trim() !== mid) continue;
		if (row.outcome !== want) continue;
		return row.shares;
	}
	return 0;
}

/**
 * Sparse map for Positions assemblers — only markets with non-zero shares.
 */
export function levelUpTokenBalancesMapFromRows(
	rows: readonly VenuePosition[],
): Map<string, Pick<LevelUpTokenBalance, "yesBalance" | "noBalance">> {
	const out = new Map<string, Pick<LevelUpTokenBalance, "yesBalance" | "noBalance">>();

	for (const row of rows) {
		if (row.venue !== "levelup") continue;
		const marketId = String(row.conditionId ?? "").trim();
		if (!marketId) continue;

		const existing = out.get(marketId) ?? {
			yesBalance: "0.000000",
			noBalance: "0.000000",
		};
		if (row.outcome === "Yes") {
			existing.yesBalance = row.shares.toFixed(6);
		} else if (row.outcome === "No") {
			existing.noBalance = row.shares.toFixed(6);
		}
		out.set(marketId, existing);
	}

	return out;
}

/** Full token balance row for a market (includes token ids from catalog). */
export function getLevelUpMarketBalance(
	rows: readonly VenuePosition[],
	marketMetaById: ReadonlyMap<string, LevelUpMarketMeta>,
	marketId: string,
): LevelUpTokenBalance | null {
	const mid = marketId.trim();
	if (!mid) return null;
	const meta = marketMetaById.get(mid);
	if (!meta) return null;

	return {
		yesTokenId: meta.yesTokenId,
		noTokenId: meta.noTokenId,
		yesBalance: readLevelUpSideShares(rows, mid, "yes").toFixed(6),
		noBalance: readLevelUpSideShares(rows, mid, "no").toFixed(6),
	};
}

/** @deprecated Prefer {@link readLevelUpSideShares}. */
export function parseLevelUpTokenBalanceShares(
	tb: Pick<LevelUpTokenBalance, "yesBalance" | "noBalance"> | null | undefined,
): { yes: number; no: number } {
	return {
		yes: parseShareCount(tb?.yesBalance),
		no: parseShareCount(tb?.noBalance),
	};
}
