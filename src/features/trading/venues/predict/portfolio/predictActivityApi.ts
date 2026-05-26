import type { VenueHistoryFill } from "@/types/trading/venuePosition";
import { normalizePredictTokenId, type TokenCostEntry } from "./predictOrdersApi";

/**
 * Activity event names returned by `GET /v1/account/activity` per Predict (Beta) OpenAPI.
 * `MATCH_SUCCESS` covers fills (buys + sells); `REDEEM` covers post-resolution claims —
 * the latter is the source of truth for History rows after the user burns their winning
 * tokens, since `/v1/positions/{address}` no longer returns them.
 */
export type PredictActivityEventName =
	| "CREATE"
	| "MATCH_SUCCESS"
	| "CANCEL"
	| "INVALIDATE"
	| "NO_MARKET_MATCH"
	| "EXPIRED"
	| "REJECTED_POST_ONLY"
	| "CONVERT"
	| "MERGE"
	| "SPLIT"
	| "REDEEM"
	| "REFUND";

/** Minimal market shape carried on every activity event (full Market schema upstream). */
export type PredictActivityMarket = {
	id: number;
	title?: string;
	question?: string;
	status?: string;
	conditionId?: string;
	imageUrl?: string;
};

export type PredictActivityOutcome = {
	name?: string;
	indexSet?: number;
	onChainId: string;
	status?: "WON" | "LOST" | null;
};

export type PredictActivityOrderData = {
	quoteType: "Ask" | "Bid";
	amount: string;
	price: string;
	fee?: { amount: string; type: "COLLATERAL" | "SHARES" };
};

export type PredictActivityEvent = {
	name: PredictActivityEventName;
	createdAt: string;
	transactionHash?: string;
	amountFilled?: string;
	priceExecuted?: string;
	order?: PredictActivityOrderData;
	market: PredictActivityMarket;
	outcome?: PredictActivityOutcome;
};

const EVENT_NAMES: ReadonlySet<string> = new Set<PredictActivityEventName>([
	"CREATE",
	"MATCH_SUCCESS",
	"CANCEL",
	"INVALIDATE",
	"NO_MARKET_MATCH",
	"EXPIRED",
	"REJECTED_POST_ONLY",
	"CONVERT",
	"MERGE",
	"SPLIT",
	"REDEEM",
	"REFUND",
]);

function isActivityEvent(x: unknown): x is PredictActivityEvent {
	if (!x || typeof x !== "object") return false;
	const r = x as Record<string, unknown>;
	if (typeof r.name !== "string" || !EVENT_NAMES.has(r.name)) return false;
	if (typeof r.createdAt !== "string") return false;
	const m = r.market;
	if (!m || typeof m !== "object") return false;
	const mr = m as Record<string, unknown>;
	if (typeof mr.id !== "number" || !Number.isFinite(mr.id)) return false;
	return true;
}

/**
 * Envelope-tolerant: array, `{ data }`, or `{ data: { data } }`. Mirrors
 * {@link normalizePredictMatchesList} so the LevelUp proxy can wrap responses safely.
 */
export function normalizePredictActivityList(raw: unknown): PredictActivityEvent[] {
	const pickArray = (val: unknown): unknown[] | null => {
		if (Array.isArray(val)) return val;
		return null;
	};

	let arr: unknown[] | null = pickArray(raw);
	if (!arr && raw && typeof raw === "object") {
		const o = raw as Record<string, unknown>;
		arr = pickArray(o.data);
		if (!arr && o.data && typeof o.data === "object") {
			arr = pickArray((o.data as Record<string, unknown>).data);
		}
	}
	if (!arr) return [];
	const out: PredictActivityEvent[] = [];
	for (const item of arr) {
		if (isActivityEvent(item)) out.push(item);
	}
	return out;
}

function activityEventTimeMs(ev: PredictActivityEvent): number | null {
	const s = ev.createdAt?.trim();
	if (!s) return null;
	const d = Date.parse(s);
	return Number.isFinite(d) ? d : null;
}

function probPriceFromAmounts(usdc: number, shares: number): number | null {
	if (shares > 0 && usdc > 0) {
		const p = usdc / shares;
		if (p > 0 && p <= 1) return p;
		if (p > 1 && p <= 100) return p / 100;
	}
	return null;
}

/**
 * BUY (Bid) leg of a `MATCH_SUCCESS`: collateral spent ≈ amount * price / 1e18 (18-decimal Predict amounts).
 * Mirrors the math in `predictMatchesApi.legBidToCostShares` so cost basis stays consistent across sources.
 */
function bidEventToCostShares(
	ev: PredictActivityEvent,
): { tokenId: string; cost: number; shares: number } | null {
	if (ev.name !== "MATCH_SUCCESS" || !ev.order) return null;
	if (ev.order.quoteType !== "Bid") return null;
	const onChainId = ev.outcome?.onChainId;
	if (!onChainId) return null;
	const tokenId = normalizePredictTokenId(onChainId);
	if (!tokenId) return null;
	let amt: bigint;
	let prc: bigint;
	try {
		amt = BigInt(ev.order.amount);
		prc = BigInt(ev.order.price);
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

function askEventToProceedsShares(
	ev: PredictActivityEvent,
): { tokenId: string; usdc: number; shares: number } | null {
	if (ev.name !== "MATCH_SUCCESS" || !ev.order) return null;
	if (ev.order.quoteType !== "Ask") return null;
	const onChainId = ev.outcome?.onChainId;
	if (!onChainId) return null;
	const tokenId = normalizePredictTokenId(onChainId);
	if (!tokenId) return null;
	let amt: bigint;
	let prc: bigint;
	try {
		amt = BigInt(ev.order.amount);
		prc = BigInt(ev.order.price);
	} catch {
		return null;
	}
	const proceedsWei = (amt * prc) / 10n ** 18n;
	const shares = Number(amt) / 1e18;
	const usdc = Number(proceedsWei) / 1e18;
	if (!Number.isFinite(shares) || !Number.isFinite(usdc)) return null;
	if (shares <= 0 && usdc <= 0) return null;
	return { tokenId, usdc, shares };
}

/**
 * Per-token cost basis from `MATCH_SUCCESS` Bid events on the activity feed. Equivalent to
 * `computePredictCostByTokenFromMatches` but does not need a `signerAddress` filter because
 * `/v1/account/activity` is already scoped to the authenticated user.
 */
export function computePredictCostByTokenFromActivity(
	events: PredictActivityEvent[],
): Map<string, TokenCostEntry> {
	const map = new Map<string, TokenCostEntry>();
	for (const ev of events) {
		const parsed = bidEventToCostShares(ev);
		if (!parsed) continue;
		const ms = activityEventTimeMs(ev);
		const existing = map.get(parsed.tokenId);
		if (existing) {
			existing.totalCost += parsed.cost;
			existing.totalShares += parsed.shares;
			existing.avgPrice = existing.totalCost / existing.totalShares;
			if (ms != null && (existing.lastTradeAtMs == null || ms > existing.lastTradeAtMs)) {
				existing.lastTradeAtMs = ms;
			}
		} else {
			map.set(parsed.tokenId, {
				totalCost: parsed.cost,
				totalShares: parsed.shares,
				avgPrice: parsed.cost / parsed.shares,
				lastTradeAtMs: ms,
			});
		}
	}
	return map;
}

/**
 * Per-outcome buy/sell fills from activity `MATCH_SUCCESS` events (used by the History tab to
 * expand a single position into individual trades).
 */
export function buildPredictHistoryFillsFromActivity(
	events: PredictActivityEvent[],
): Map<string, VenueHistoryFill[]> {
	const byMint = new Map<string, VenueHistoryFill[]>();

	for (const ev of events) {
		if (ev.name !== "MATCH_SUCCESS") continue;
		const ms = activityEventTimeMs(ev);
		const tradedAt = ms != null ? new Date(ms).toISOString() : "";
		const tx = ev.transactionHash?.trim() || "";
		const srcBase = tx || `activity-${ev.createdAt}`;

		const bid = bidEventToCostShares(ev);
		if (bid) {
			const arr = byMint.get(bid.tokenId) ?? [];
			arr.push({
				side: "buy",
				shares: Math.max(bid.shares, 0),
				usdc: Math.max(bid.cost, 0),
				tradedAt,
				sourceId: `${srcBase}:bid`,
				price: probPriceFromAmounts(bid.cost, bid.shares),
			});
			byMint.set(bid.tokenId, arr);
			continue;
		}
		const ask = askEventToProceedsShares(ev);
		if (ask) {
			const arr = byMint.get(ask.tokenId) ?? [];
			arr.push({
				side: "sell",
				shares: Math.max(ask.shares, 0),
				usdc: Math.max(ask.usdc, 0),
				tradedAt,
				sourceId: `${srcBase}:ask`,
				price: probPriceFromAmounts(ask.usdc, ask.shares),
			});
			byMint.set(ask.tokenId, arr);
		}
	}

	for (const fills of byMint.values()) {
		fills.sort((a, b) => Date.parse(a.tradedAt || "0") - Date.parse(b.tradedAt || "0"));
	}
	return byMint;
}

export type PredictRedeemEntry = {
	tokenId: string;
	createdAt: string;
	createdAtMs: number | null;
	transactionHash?: string;
	/** Payout received from redemption in USDC (decoded from `amountFilled` wei). */
	payoutUsdc: number;
	market: PredictActivityMarket;
	outcome?: PredictActivityOutcome;
};

/**
 * Group `REDEEM` events by `outcome.onChainId`. After a user claims their winning Predict
 * tokens the ERC1155 balance is burned, so `REDEEM` is the only on-chain trace of the win.
 * Used to synthesize History rows that survive the burn.
 */
export function predictRedeemEventsByToken(
	events: PredictActivityEvent[],
): Map<string, PredictRedeemEntry[]> {
	const out = new Map<string, PredictRedeemEntry[]>();
	for (const ev of events) {
		if (ev.name !== "REDEEM") continue;
		const onChainId = ev.outcome?.onChainId;
		if (!onChainId) continue;
		const tokenId = normalizePredictTokenId(onChainId);
		if (!tokenId) continue;

		let payoutUsdc = 0;
		const raw = ev.amountFilled?.trim();
		if (raw) {
			try {
				payoutUsdc = Number(BigInt(raw)) / 1e18;
			} catch {
				const n = Number(raw);
				if (Number.isFinite(n)) payoutUsdc = n / 1e18;
			}
		}

		const ms = activityEventTimeMs(ev);
		const entry: PredictRedeemEntry = {
			tokenId,
			createdAt: ev.createdAt,
			createdAtMs: ms,
			transactionHash: ev.transactionHash?.trim() || undefined,
			payoutUsdc: Number.isFinite(payoutUsdc) && payoutUsdc > 0 ? payoutUsdc : 0,
			market: ev.market,
			outcome: ev.outcome,
		};
		const arr = out.get(tokenId) ?? [];
		arr.push(entry);
		out.set(tokenId, arr);
	}
	for (const arr of out.values()) {
		arr.sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
	}
	return out;
}

/** Sum redeem payouts across (potentially multiple) `REDEEM` events on the same token. */
export function sumPredictRedeemPayout(entries: PredictRedeemEntry[]): number {
	let total = 0;
	for (const e of entries) {
		if (Number.isFinite(e.payoutUsdc) && e.payoutUsdc > 0) total += e.payoutUsdc;
	}
	return total;
}

/**
 * For tokens that only appear in activity (no FILLED order row, no `/v1/orders/matches` row),
 * resolve numeric market id from the embedded `market.id`.
 */
export function predictMarketIdForTokenFromActivity(
	events: PredictActivityEvent[],
	tokenId: string,
): number | null {
	const want = normalizePredictTokenId(tokenId);
	if (!want) return null;
	for (const ev of events) {
		const mid = ev.market?.id;
		if (mid == null || !Number.isFinite(Number(mid))) continue;
		if (ev.outcome?.onChainId && normalizePredictTokenId(ev.outcome.onChainId) === want) {
			return Number(mid);
		}
	}
	return null;
}
