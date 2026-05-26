import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type { UmbrellaPositions, MarketPosition } from "@/features/positions/utils/positionHelpers";

/** Minimal market shape — supports LevelUp docs + venue synthesised rows after merge */
type PredictionMarketLite = {
	_id?: string;
	questionId?: string;
	marketId?: string;
	conditionId?: string;
	resolvedOutcome?: string;
	_venueHeldTokenId?: string;
	_polyAssetTokenId?: string;
};

/** Block History rows that mirror any Positions holdings (identifiers line up loosely across LU mongo ids, Poly conditionIds / token ids). */
export type HistoryHoldingsBlockedKeys = {
	questionKeys: Set<string>;
	tokenIds: Set<string>;
};

function normalizeKey(v: unknown): string | null {
	if (v == null) return null;
	const s = String(v).trim();
	return s.length > 0 ? s : null;
}

function addKeysFromMarket(mp: PredictionMarketLite, qb: Set<string>, tok: Set<string>) {
	const m = mp as Record<string, unknown>;
	for (const k of ["_id", "questionId", "marketId", "conditionId"] as const) {
		const id = normalizeKey(m[k]);
		if (id) qb.add(id);
	}
	const t1 = normalizeKey(m._venueHeldTokenId);
	if (t1) tok.add(t1);
	const t2 = normalizeKey(m._polyAssetTokenId);
	if (t2) tok.add(t2);
}

/**
 * Resolved / claim winnings: same keys History might show for that outcome —
 * exclude only when user still holds the **winning** side (parity with Winnings strip).
 */
function accumulateFromResolvedHoldings(
	resolved: UmbrellaPositions[],
	qb: Set<string>,
	tok: Set<string>,
) {
	for (const { markets } of resolved) {
		for (const mp of markets) {
			const outcome = String(
				(mp.market as PredictionMarketLite).resolvedOutcome || "",
			).toLowerCase();
			if (outcome !== "yes" && outcome !== "no") continue;

			const winShares = outcome === "yes" ? mp.yesBalance : mp.noBalance;
			if (!(Number(winShares) > 0)) continue;

			addKeysFromMarket(mp.market as PredictionMarketLite, qb, tok);
		}
	}
}

/**
 * Open Positions strip (live MTM): any residual shares — LU row, merged Poly Predict leg, etc.
 * History must not duplicate the same match while shares still render under Positions.
 */
function accumulateFromOpenHoldings(open: UmbrellaPositions[], qb: Set<string>, tok: Set<string>) {
	for (const { markets } of open) {
		for (const mp of markets as MarketPosition[]) {
			if (!(Number(mp.yesBalance) > 0 || Number(mp.noBalance) > 0)) continue;
			addKeysFromMarket(mp.market as PredictionMarketLite, qb, tok);
			for (const o of mp.orders as ProcessedOrder[]) {
				const qid = normalizeKey(o.questionId);
				if (qid) qb.add(qid);
				const tid = normalizeKey(o.tokenId);
				if (tid) tok.add(tid);
			}
		}
	}
}

export function buildHistoryHoldingsBlockedKeys(
	openPositions: UmbrellaPositions[],
	resolvedPositions: UmbrellaPositions[],
): HistoryHoldingsBlockedKeys {
	const questionKeys = new Set<string>();
	const tokenIds = new Set<string>();
	accumulateFromResolvedHoldings(resolvedPositions, questionKeys, tokenIds);
	accumulateFromOpenHoldings(openPositions, questionKeys, tokenIds);
	return { questionKeys, tokenIds };
}

export type UnifiedHistoryBlockForFilter = {
	id: string;
	luMarkets: Array<{
		market: { _id?: string; questionId?: string; marketId?: string; conditionId?: string };
	}>;
	venuePositions: VenuePosition[];
};

function luMarketTouchesBlocked(
	market: UnifiedHistoryBlockForFilter["luMarkets"][number]["market"],
	qb: Set<string>,
): boolean {
	const m = market as Record<string, unknown>;
	for (const field of ["_id", "questionId", "marketId", "conditionId"] as const) {
		const id = normalizeKey(m[field]);
		if (id && qb.has(id)) return true;
	}
	return false;
}

export function filterUnifiedHistoryBlocksByOpenPositions<T extends UnifiedHistoryBlockForFilter>(
	blocks: T[],
	blocked: HistoryHoldingsBlockedKeys,
): T[] {
	const out: T[] = [];
	for (const block of blocks) {
		const luMarkets = block.luMarkets.filter(
			(row) => !luMarketTouchesBlocked(row.market, blocked.questionKeys),
		);
		const venuePositions = block.venuePositions.filter((pos) => {
			const tid = pos.tokenId?.trim();
			if (tid && blocked.tokenIds.has(tid)) return false;
			const cid = pos.conditionId?.trim();
			if (cid && blocked.questionKeys.has(cid)) return false;
			return true;
		});
		if (luMarkets.length === 0 && venuePositions.length === 0) continue;
		out.push({ ...block, luMarkets, venuePositions });
	}
	return out;
}
