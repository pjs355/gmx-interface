import type { VenueHistoryFill } from "@/types/trading/venuePosition";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import { normalizePredictTokenId, type TokenCostEntry } from "../portfolio/predictOrdersApi";

/** Row from Predict `GET /v1/orders/matches` (proxied). */
export type PredictMatchLeg = {
	quoteType: "Ask" | "Bid";
	amount: string;
	price: string;
	outcome: { onChainId: string; name?: string };
	signer: string;
	fee?: { amount: string; type: string };
};

export type PredictMatchEventRow = {
	market?: { id?: number };
	/** Injected by LevelUp private API from Mongo `exchangeMatching.predictFun`. */
	levelUpUmbrellaId?: string;
	levelUpUmbrellaDisplayName?: string;
	taker: PredictMatchLeg;
	makers: PredictMatchLeg[];
	amountFilled: string;
	priceExecuted: string;
	transactionHash?: string;
	executedAt?: string;
};

function addrsEq(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function isMatchLeg(x: unknown): x is PredictMatchLeg {
	if (!x || typeof x !== "object") return false;
	const r = x as Record<string, unknown>;
	if (r.quoteType !== "Ask" && r.quoteType !== "Bid") return false;
	const o = r.outcome;
	if (!o || typeof o !== "object") return false;
	return (
		typeof (o as Record<string, unknown>).onChainId === "string" &&
		typeof r.amount === "string" &&
		typeof r.price === "string" &&
		typeof r.signer === "string"
	);
}

function matchEventTimeMs(m: PredictMatchEventRow): number | null {
	const s = m.executedAt?.trim();
	if (!s) return null;
	const d = Date.parse(s);
	return Number.isFinite(d) ? d : null;
}

function isMatchRow(x: unknown): x is PredictMatchEventRow {
	if (!x || typeof x !== "object") return false;
	const r = x as Record<string, unknown>;
	if (!isMatchLeg(r.taker)) return false;
	if (!Array.isArray(r.makers)) return false;
	return (
		typeof r.amountFilled === "string" &&
		typeof r.priceExecuted === "string" &&
		r.makers.every((m) => isMatchLeg(m))
	);
}

/**
 * Normalize proxied match list bodies (array or `{ data }` / nested envelopes).
 */
export function normalizePredictMatchesList(raw: unknown): PredictMatchEventRow[] {
	if (Array.isArray(raw)) {
		if (raw.length === 0) return [];
		if (isMatchRow(raw[0])) return raw as PredictMatchEventRow[];
		return [];
	}
	if (!raw || typeof raw !== "object") return [];
	const o = raw as Record<string, unknown>;
	if (Array.isArray(o.data)) {
		const arr = o.data as unknown[];
		if (arr.length > 0 && isMatchRow(arr[0])) return arr as PredictMatchEventRow[];
		return [];
	}
	const inner = o.data;
	if (inner && typeof inner === "object") {
		const mid = inner as Record<string, unknown>;
		if (Array.isArray(mid.data) && mid.data.length > 0 && isMatchRow(mid.data[0])) {
			return mid.data as PredictMatchEventRow[];
		}
	}
	return [];
}

/**
 * BUY leg: `quoteType === "Bid"` — collateral spent ≈ amountWei * priceWei / 1e18 (18-decimal Predict amounts).
 * See {@link computePredictCostByToken} on order rows for the same USDT/shares units.
 */
function legBidToCostShares(leg: PredictMatchLeg): {
	tokenId: string;
	cost: number;
	shares: number;
} | null {
	const tokenId = normalizePredictTokenId(leg.outcome.onChainId);
	if (!tokenId) return null;
	let amt: bigint;
	let prc: bigint;
	try {
		amt = BigInt(leg.amount);
		prc = BigInt(leg.price);
	} catch {
		return null;
	}
	const costWei = (amt * prc) / 10n ** 18n;
	const shares = Number(amt) / 1e18;
	const cost = Number(costWei) / 1e18;
	if (!Number.isFinite(shares) || !Number.isFinite(cost) || shares <= 0 || cost <= 0) {
		return null;
	}
	return { tokenId, cost, shares };
}

function matchLevelFallback(
	m: PredictMatchEventRow,
	filterSigner: string,
): { tokenId: string; cost: number; shares: number } | null {
	if (!addrsEq(m.taker.signer, filterSigner) || m.taker.quoteType !== "Bid") {
		return null;
	}
	const tokenId = normalizePredictTokenId(m.taker.outcome.onChainId);
	if (!tokenId) return null;
	const shares = Number(m.amountFilled) / 1e18;
	const px = Number(m.priceExecuted) / 1e18;
	if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(px) || px < 0) {
		return null;
	}
	const cost = shares * px;
	if (!Number.isFinite(cost) || cost <= 0) return null;
	return { tokenId, cost, shares };
}

/**
 * Build per-outcome cost basis from order **match** events filtered by `signerAddress`
 * (same address passed to `GET /v1/orders/matches`). Uses **Bid** legs where `leg.signer`
 * matches — when leg-level amounts are ambiguous, falls back to `amountFilled` × `priceExecuted`
 * for taker bids only.
 */
export function computePredictCostByTokenFromMatches(
	filterSigner: string,
	matches: PredictMatchEventRow[],
): Map<string, TokenCostEntry> {
	const map = new Map<string, TokenCostEntry>();
	const filter = filterSigner.trim();
	if (!filter.startsWith("0x")) return map;

	function add(tokenId: string, cost: number, shares: number, fillMs: number | null) {
		const existing = map.get(tokenId);
		if (existing) {
			existing.totalCost += cost;
			existing.totalShares += shares;
			existing.avgPrice = existing.totalCost / existing.totalShares;
			if (fillMs != null && (existing.lastTradeAtMs == null || fillMs > existing.lastTradeAtMs)) {
				existing.lastTradeAtMs = fillMs;
			}
		} else {
			map.set(tokenId, {
				totalCost: cost,
				totalShares: shares,
				avgPrice: cost / shares,
				lastTradeAtMs: fillMs,
			});
		}
	}

	for (const m of matches) {
		if (!m?.taker || !Array.isArray(m.makers)) continue;
		const rowMs = matchEventTimeMs(m);
		const legs = [m.taker, ...m.makers];
		let anyLeg = false;
		for (const leg of legs) {
			if (!addrsEq(leg.signer, filter) || leg.quoteType !== "Bid") continue;
			const parsed = legBidToCostShares(leg);
			if (parsed) {
				add(parsed.tokenId, parsed.cost, parsed.shares, rowMs);
				anyLeg = true;
			}
		}
		if (!anyLeg) {
			const fb = matchLevelFallback(m, filter);
			if (fb) add(fb.tokenId, fb.cost, fb.shares, rowMs);
		}
	}

	return map;
}

function matchProbPrice(usdc: number, shares: number): number | null {
	if (shares > 0 && usdc > 0) {
		const p = usdc / shares;
		if (p > 0 && p <= 1) return p;
		if (p > 1 && p <= 100) return p / 100;
	}
	return null;
}

/**
 * Per-outcome fills from chain match events (buys via Bid legs, sells via Ask legs).
 */
export function buildPredictHistoryFillsFromMatches(
	filterSigner: string,
	matches: PredictMatchEventRow[],
): Map<string, VenueHistoryFill[]> {
	const byMint = new Map<string, VenueHistoryFill[]>();
	const filter = filterSigner.trim();
	if (!filter.startsWith("0x")) return byMint;

	function pushFill(tokenId: string, fill: VenueHistoryFill): void {
		const arr = byMint.get(tokenId) ?? [];
		arr.push(fill);
		byMint.set(tokenId, arr);
	}

	function pushBidFill(leg: PredictMatchLeg, rowMs: number | null, src: string): void {
		const parsed = legBidToCostShares(leg);
		if (!parsed) return;
		const tradedAt = rowMs != null ? new Date(rowMs).toISOString() : "";
		pushFill(parsed.tokenId, {
			side: "buy",
			shares: parsed.shares,
			usdc: parsed.cost,
			tradedAt,
			sourceId: `${src}:bid`,
			price: matchProbPrice(parsed.cost, parsed.shares),
		});
	}

	function pushAskFill(leg: PredictMatchLeg, rowMs: number | null, src: string): void {
		if (leg.quoteType !== "Ask") return;
		const tokenId = normalizePredictTokenId(leg.outcome.onChainId);
		if (!tokenId) return;
		let amt: bigint;
		let prc: bigint;
		try {
			amt = BigInt(leg.amount);
			prc = BigInt(leg.price);
		} catch {
			return;
		}
		const proceedsWei = (amt * prc) / 10n ** 18n;
		const shares = Number(amt) / 1e18;
		const usdc = Number(proceedsWei) / 1e18;
		if (!Number.isFinite(shares) || !Number.isFinite(usdc) || (shares <= 0 && usdc <= 0)) {
			return;
		}
		const tradedAt = rowMs != null ? new Date(rowMs).toISOString() : "";
		pushFill(tokenId, {
			side: "sell",
			shares: Math.max(shares, 0),
			usdc: Math.max(usdc, 0),
			tradedAt,
			sourceId: `${src}:ask`,
			price: matchProbPrice(usdc, shares),
		});
	}

	for (const m of matches) {
		if (!m?.taker || !Array.isArray(m.makers)) continue;
		const rowMs = matchEventTimeMs(m);
		const tx = m.transactionHash?.trim() || "";
		const srcBase = tx || `match-${m.amountFilled?.slice(0, 12) ?? "?"}`;
		const legs = [m.taker, ...m.makers];
		for (let i = 0; i < legs.length; i++) {
			const leg = legs[i]!;
			if (!addrsEq(leg.signer, filter)) continue;
			const src = `${srcBase}:leg${i}`;
			if (leg.quoteType === "Bid") {
				pushBidFill(leg, rowMs, src);
			} else if (leg.quoteType === "Ask") {
				pushAskFill(leg, rowMs, src);
			}
		}
	}

	for (const fills of byMint.values()) {
		fills.sort((a, b) => Date.parse(a.tradedAt || "0") - Date.parse(b.tradedAt || "0"));
	}
	return byMint;
}

/**
 * For tokens that only appear in matches (no FILLED order row), resolve numeric market id.
 */
export function predictMarketIdForTokenFromMatches(
	matches: PredictMatchEventRow[],
	tokenId: string,
): number | null {
	const want = normalizePredictTokenId(tokenId);
	if (!want) return null;
	for (const m of matches) {
		const mid = m.market?.id;
		if (mid == null || !Number.isFinite(Number(mid))) continue;
		const legs = [m.taker, ...m.makers];
		for (const leg of legs) {
			if (normalizePredictTokenId(leg.outcome.onChainId) === want) {
				return Number(mid);
			}
		}
	}
	return null;
}

/**
 * When {@link predictMarketIdForTokenFromMatches} and order `marketId` are unavailable,
 * infer market id from any loaded {@link PredictMarketDetail} whose outcomes include the token.
 */
export function predictMarketIdForTokenFromDetailsMap(
	details: Map<number, PredictMarketDetail>,
	tokenId: string,
): number | null {
	const want = normalizePredictTokenId(tokenId);
	if (!want) return null;
	for (const [mid, d] of details) {
		for (const o of d.outcomes ?? []) {
			if (normalizePredictTokenId(o.onChainId) === want) return mid;
		}
		const res = d.resolution;
		if (res?.onChainId && normalizePredictTokenId(res.onChainId) === want) return mid;
	}
	return null;
}
