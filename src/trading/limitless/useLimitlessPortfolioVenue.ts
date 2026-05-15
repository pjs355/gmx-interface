import { useQuery } from "@tanstack/react-query";
import {
	type VenueOrder,
	type VenuePosition,
	isVenueMarketResolvedLike,
	venueDisplayLabel,
} from "@/types/trading/venuePosition";
import { getLimitlessVenueBucket } from "@/trading/limitless/splitLimitlessVenuePositions";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { PrivateApiError } from "@/services/privateApi/errors";
import { limitlessQueryKeys } from "./limitlessQueryKeys";
import { canonicalLimitlessTokenId } from "./limitlessTokenId";
import { isLimitlessVenueSharesMeaningful } from "./limitlessVenueSharesFilter";
import {
	debugLimitlessPortfolio,
	debugLimitlessPortfolioTable,
	debugLimitlessShallowRowShape,
} from "./limitlessPortfolioDebug";

function num(v: unknown): number {
	if (v === null || v === undefined || v === "") return 0;
	const n = typeof v === "string" ? Number.parseFloat(v) : Number(v);
	return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

/** Partner `market.group.slug` for neg-risk sibling CLOB legs (same group, different leg slugs). */
function readLimitlessGroupSlugFromRaw(o: Record<string, unknown>): string {
	const top = str(o.groupSlug);
	if (top) return top;
	const mk = o.market;
	if (mk && typeof mk === "object") {
		const g = (mk as Record<string, unknown>).group;
		if (g && typeof g === "object") {
			return str((g as Record<string, unknown>).slug);
		}
	}
	return "";
}

/** Same as predictions verify-allowance / positions-venue: `negRiskRequestId` or `negRiskMarketId` on row or nested `market`. */
function limitlessNegRiskWireFromPositionsRow(o: Record<string, unknown>): boolean {
	const market =
		o.market && typeof o.market === "object"
			? (o.market as Record<string, unknown>)
			: undefined;
	const nonEmptyReq = (rec: Record<string, unknown> | undefined) => {
		const v = rec?.negRiskRequestId;
		return typeof v === "string" && v.trim() !== "";
	};
	const nonEmptyMkt = (rec: Record<string, unknown> | undefined) => {
		if (!rec) return false;
		for (const k of [
			"negRiskMarketId",
			"neg_risk_market_id",
			"negRiskMarketID",
		] as const) {
			const v = rec[k];
			if (typeof v === "string" && v.trim() !== "") return true;
		}
		return false;
	};
	return (
		nonEmptyReq(market) ||
		nonEmptyReq(o) ||
		nonEmptyMkt(market) ||
		nonEmptyMkt(o)
	);
}

const BYTES32_HEX = /^0x[a-fA-F0-9]{64}$/i;

/** Accepts `0x` + 64 hex or bare 64 hex; returns lowercased `0x…` or `""`. */
function normalizeBytes32HexLoose(raw: string): string {
	const t = raw.trim();
	if (!t) return "";
	const with0x = /^0x/i.test(t)
		? t
		: /^[a-fA-F0-9]{64}$/i.test(t)
			? `0x${t}`
			: "";
	if (!BYTES32_HEX.test(with0x)) return "";
	return with0x.toLowerCase();
}

/**
 * NegRisk groups expose `group.negRiskMarketId` (parent). On-chain redeem uses the
 * leg `conditionId` plus `venue.adapter` when the partner marks NegRisk.
 */
function negRiskParentConditionIdFromPositionsRow(
	o: Record<string, unknown>,
	legConditionId: string,
): string {
	const group =
		o.group && typeof o.group === "object"
			? (o.group as Record<string, unknown>)
			: null;
	const market =
		o.market && typeof o.market === "object"
			? (o.market as Record<string, unknown>)
			: null;
	const nestedGroup =
		market?.group && typeof market.group === "object"
			? (market.group as Record<string, unknown>)
			: null;
	const leg = legConditionId.trim().toLowerCase();
	/** Match predictions `collectNegRiskParentRawCandidates`: group on market, then on row, then roots. */
	for (const v of [
		o.negRiskParentConditionId,
		nestedGroup?.negRiskMarketId,
		nestedGroup?.neg_risk_market_id,
		nestedGroup?.negRiskMarketID,
		group?.negRiskMarketId,
		group?.neg_risk_market_id,
		group?.negRiskMarketID,
		market?.negRiskMarketId,
		market?.neg_risk_market_id,
		market?.negRiskMarketID,
		o.negRiskMarketId,
		o.neg_risk_market_id,
		o.negRiskMarketID,
	]) {
		const s = str(v);
		const n = normalizeBytes32HexLoose(s);
		if (n && n !== leg) return n;
	}
	return "";
}

/**
 * Local / staging API often omits Limitless routes entirely (501/405).
 * A real 404 is a routing or auth bug — surface it so React Query records
 * `isError` instead of silently returning an empty portfolio.
 */
function isLimitlessRouteUnavailable(err: unknown): boolean {
	return (
		err instanceof PrivateApiError &&
		(err.status === 501 || err.status === 405)
	);
}

/**
 * Normalizes rows from our proxy `GET /api/limitless/portfolio/positions-venue`, which mirrors
 * Limitless `GET /portfolio/positions` (`clob` + `amm` — see
 * [Portfolio & Positions](https://docs.limitless.exchange/developers/sdk/typescript/portfolio) and
 * [AMM positions](https://docs.limitless.exchange/developers/sdk/typescript/portfolio#amm-positions)).
 * Limitless also notes that `RESOLVED` on a market does not guarantee on-chain payout yet —
 * [Get Positions](https://docs.limitless.exchange/api-reference/portfolio/positions).
 * The proxy adds `limitlessPartnerRedeemableSignal` (`omit` | `true` | `false`) for
 * diagnostics; EOA Claim uses on-chain redeem and does not gate on this flag alone.
 */
function mapPositionsVenueRow(raw: unknown): VenuePosition | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const tokenId = canonicalLimitlessTokenId(str(o.tokenId));
	if (!tokenId) return null;
	const shares = num(o.shares);
	if (!isLimitlessVenueSharesMeaningful(shares)) return null;
	const slug = str(o.marketSlug);
	const limitlessGroupSlug = readLimitlessGroupSlugFromRaw(o);
	const status = str(o.marketStatus);
	const redeemable = o.redeemable === true;
	const redeemPending = o.redeemPending === true;
	const sigRaw = o.limitlessPartnerRedeemableSignal;
	const limitlessPartnerRedeemableSignal =
		sigRaw === "omit" || sigRaw === "true" || sigRaw === "false"
			? sigRaw
			: undefined;
	const posOut: VenuePosition = {
		venue: "limitless",
		marketTitle: str(o.marketTitle) || slug || venueDisplayLabel("limitless"),
		outcome: str(o.outcome) || "Yes",
		shares,
		avgPrice:
			o.avgPrice === null || o.avgPrice === undefined
				? null
				: num(o.avgPrice),
		currentPrice:
			o.currentPrice === null || o.currentPrice === undefined
				? null
				: num(o.currentPrice),
		cost: o.cost === null || o.cost === undefined ? null : num(o.cost),
		currentValue: num(o.currentValue),
		pnl: o.pnl === null || o.pnl === undefined ? null : num(o.pnl),
		pnlPercent:
			o.pnlPercent === null || o.pnlPercent === undefined
				? null
				: num(o.pnlPercent),
		tokenId,
		conditionId: str(o.conditionId) || undefined,
		eventSlug: slug || undefined,
		...(limitlessGroupSlug ? { limitlessGroupSlug } : {}),
		redeemable,
		...(redeemPending ? { redeemPending: true } : {}),
		...(limitlessPartnerRedeemableSignal
			? { limitlessPartnerRedeemableSignal }
			: {}),
		marketStatus: status || undefined,
	};
	const legCid = posOut.conditionId ?? "";
	const negParent = negRiskParentConditionIdFromPositionsRow(o, legCid);
	if (negParent) {
		posOut.negRiskParentConditionId = negParent;
		posOut.isNegRisk = true;
	} else if (o.isNegRisk === true) {
		posOut.isNegRisk = true;
	} else if (limitlessNegRiskWireFromPositionsRow(o)) {
		posOut.isNegRisk = true;
	}
	const vex = str(o.limitlessVenueExchange);
	const vad = str(o.limitlessVenueAdapter);
	const coll = str(o.limitlessCollateralAddress);
	if (vex) posOut.limitlessVenueExchange = vex;
	if (vad) posOut.limitlessVenueAdapter = vad;
	if (coll) posOut.limitlessCollateralAddress = coll;
	if (typeof o.marketClosed === "boolean") {
		posOut.marketClosed = o.marketClosed;
	}
	const wix = o.winningOutcomeIndex;
	if (wix === null) {
		posOut.winningOutcomeIndex = null;
	} else if (typeof wix === "number" && Number.isFinite(wix)) {
		posOut.winningOutcomeIndex = wix;
	}
	return posOut;
}

function mapOpenOrderRow(raw: unknown): VenueOrder | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const orderId = str(o.orderId);
	if (!orderId) return null;
	const position = o.position === "No" ? "No" : "Yes";
	const side = o.side === "sell" ? "sell" : "buy";
	const tokenId = canonicalLimitlessTokenId(str(o.tokenId));
	return {
		venue: "limitless",
		orderId,
		marketTitle: str(o.marketTitle) || str(o.marketSlug) || venueDisplayLabel("limitless"),
		side,
		position,
		price: num(o.price),
		size: num(o.size),
		filled: false,
		tokenId,
		marketId: str(o.marketSlug) || undefined,
	};
}

/** Partner `GET /portfolio/history` — see https://docs.limitless.exchange/api-reference/portfolio/history ; SDK `HistoryEntry` is minimal and fill data often lives in `details`. */
function extractHistoryArray(body: unknown): unknown[] {
	if (!body || typeof body !== "object") return [];
	const o = body as Record<string, unknown>;
	if (Array.isArray(o.data)) return o.data;
	if (Array.isArray(o.items)) return o.items;
	if (Array.isArray(o.history)) return o.history;
	if (Array.isArray(o.results)) return o.results;
	if (Array.isArray(body)) return body as unknown[];
	return [];
}

/** Limitless `HistoryEntry` often nests fill fields under `details`; top-level wins on conflicts. */
function flattenHistoryRow(row: Record<string, unknown>): Record<string, unknown> {
	const details =
		row.details && typeof row.details === "object"
			? (row.details as Record<string, unknown>)
			: {};
	return { ...details, ...row };
}

/** Parse 6-decimal fixed-point token strings (same convention as CLOB balances). */
function sharesFromMaybe6dpString(v: unknown): number {
	if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
	if (typeof v !== "string" || !/^-?\d+$/.test(v.trim())) return 0;
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return 0;
	return n / 1e6;
}

function normalizeProbPrice(p: number): number {
	if (!Number.isFinite(p) || p <= 0) return 0;
	if (p <= 1) return p;
	if (p <= 100) return p / 100;
	return p;
}

function usdcHumanFromHistorySrc(
	row: Record<string, unknown>,
	amountUsedForShareMicros: boolean,
): number {
	const u = num(
		row.usdcSize ??
			row.usd ??
			row.cash ??
			row.collateral ??
			row.totalUSD ??
			row.usdAmount ??
			row.usdc ??
			row.spentUsd ??
			row.filledUsd,
	);
	if (u > 0) return u;
	for (const k of [
		"usdcAmount",
		"collateralAmount",
		"quoteAmount",
		"spent",
		"totalCost",
		"notional",
		"costUsd",
	]) {
		const v = row[k];
		if (typeof v === "string" && /^-?\d+$/.test(v.trim())) {
			const h = Number(v) / 1e6;
			if (Number.isFinite(h) && h > 0) return h;
		}
	}
	if (
		!amountUsedForShareMicros &&
		typeof row.amount === "string" &&
		/^-?\d+$/.test(row.amount.trim())
	) {
		const micro = Number(row.amount) / 1e6;
		if (Number.isFinite(micro) && micro > 0 && micro < 1e7) return micro;
	}
	return 0;
}

/** Integer-string micros (6 dp) as probability, else small numeric price / cents. */
function probFromLoosePriceField(v: unknown): number {
	if (typeof v === "number" && Number.isFinite(v) && v > 0) return normalizeProbPrice(v);
	if (typeof v !== "string" || !/^-?\d+$/.test(v.trim())) return 0;
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return 0;
	const micro = n / 1e6;
	if (micro > 0 && micro <= 1) return micro;
	if (n > 0 && n <= 100) return normalizeProbPrice(n);
	return 0;
}

function priceCandidateFromHistoryField(v: unknown): number {
	if (v === null || v === undefined) return 0;
	if (typeof v === "string" && /^-?\d+$/.test(v.trim())) {
		return probFromLoosePriceField(v);
	}
	const n = num(v);
	return n > 0 ? normalizeProbPrice(n) : 0;
}

function rawPriceFromHistorySrc(src: Record<string, unknown>): number {
	const keys = [
		"price",
		"avgPrice",
		"executionPrice",
		"avgFillPrice",
		"matchedPrice",
		"fillPrice",
		"averagePrice",
		"makerPrice",
		"takerPrice",
		"limitPrice",
		"tradePrice",
	];
	let best = 0;
	for (const k of keys) {
		const p = priceCandidateFromHistoryField(src[k]);
		if (p > best) best = p;
	}
	return best;
}

function mapHistoryRowToVenuePosition(row: unknown): VenuePosition | null {
	if (!row || typeof row !== "object") return null;
	const o = row as Record<string, unknown>;
	const src = flattenHistoryRow(o);
	const historySourceId = str(src.id);
	const tokenId = canonicalLimitlessTokenId(
		str(
			src.tokenId ??
				src.asset ??
				src.positionId ??
				src.outcomeTokenId ??
				src.token_id,
		),
	);
	if (!tokenId) return null;

	let shares = num(
		src.size ??
			src.shares ??
			src.contracts ??
			src.tokenAmount ??
			src.quantity ??
			src.matchedSize ??
			src.fillSize,
	);
	let usedAmountForShares = false;
	if (shares <= 0 && typeof src.amount === "string" && /^-?\d+$/.test(src.amount.trim())) {
		shares = sharesFromMaybe6dpString(src.amount);
		if (shares > 0) usedAmountForShares = true;
	}
	if (shares <= 0 && typeof src.amount === "number") {
		shares = num(src.amount);
	}
	const rawPrice = rawPriceFromHistorySrc(src);

	let usdc = usdcHumanFromHistorySrc(src, usedAmountForShares);
	let price = normalizeProbPrice(rawPrice);
	if (shares <= 0 && price > 0 && usdc > 0) shares = usdc / price;
	/** Claim / redeem row: partner sometimes sends USDC payout without token amount — binary payout ≈ $1/share */
	if (shares <= 0 && usdc > 0) {
		shares = usdc;
		if (price <= 0) price = 1;
	}
	if (shares <= 0) return null;
	const slug =
		str(src.marketSlug ?? src.slug) ||
		str((src.market as Record<string, unknown> | undefined)?.slug);
	const title =
		str(src.title ?? src.marketTitle) ||
		str((src.market as Record<string, unknown> | undefined)?.title) ||
		slug ||
		venueDisplayLabel("limitless");
	const marketObj = src.market as Record<string, unknown> | undefined;
	const marketStatus =
		str(
			src.marketStatus ??
				src.status ??
				src.state ??
				marketObj?.status ??
				marketObj?.marketStatus,
		) || undefined;
	const cost = usdc > 0 ? usdc : price > 0 && shares > 0 ? price * shares : null;
	let avgPrice =
		price > 0 ? price : cost != null && shares > 0 ? normalizeProbPrice(cost / shares) : null;
	if (avgPrice != null && avgPrice > 1 && avgPrice <= 100) {
		avgPrice = normalizeProbPrice(avgPrice);
	}
	const outcome = str(src.outcome) || "Yes";
	const sideU = str(src.side).toUpperCase();
	const historyTradeSide: "buy" | "sell" | undefined =
		sideU === "SELL" || sideU === "1"
			? "sell"
			: sideU === "BUY" || sideU === "0"
				? "buy"
				: undefined;
	const tsRaw = str(src.createdAt ?? src.timestamp ?? src.time ?? src.date);
	const historyTradeAt = tsRaw || undefined;
	if (import.meta.env.DEV && (price <= 0 || usdc <= 0)) {
		const keys = Object.keys(src).filter((k) => !/secret|password|key/i.test(k));
		debugLimitlessPortfolio("history row mapped (weak price/usdc)", {
			title,
			slug,
			outcome,
			marketStatus,
			shares,
			price,
			usdc,
			tokenId: tokenId.slice(0, 24),
			topKeys: keys.slice(0, 40),
		});
	}
	return {
		venue: "limitless",
		marketTitle: title,
		outcome,
		shares,
		avgPrice,
		currentPrice: null,
		cost,
		currentValue: 0,
		pnl: null,
		pnlPercent: null,
		tokenId,
		eventSlug: slug || undefined,
		marketStatus,
		historySourceId: historySourceId || undefined,
		historyTradeAt,
		historyTradeSide,
	};
}

async function fetchLimitlessTradeHistoryPages(
	getHistory: (q: {
		limit: number;
		cursor?: string | null;
	}) => Promise<unknown>,
): Promise<VenuePosition[]> {
	const limit = 50;
	const out: VenuePosition[] = [];
	const seen = new Set<string>();
	/** Limitless `/portfolio/history` uses cursor pagination (OpenAPI: `cursor` + `limit`). */
	const maxHistoryPages = 100;
	let cursor: string | null | undefined;
	for (let i = 0; i < maxHistoryPages; i++) {
		const body = await getHistory({ limit, cursor });
		const rows = extractHistoryArray(body);
		if (rows.length === 0) break;
		if (import.meta.env.DEV && i === 0 && rows[0]) {
			debugLimitlessShallowRowShape(
				"GET portfolio/history first page first raw row",
				rows[0],
			);
		}
		let added = 0;
		for (const r of rows) {
			const v = mapHistoryRowToVenuePosition(r);
			if (!v) continue;
			const ro = r as Record<string, unknown>;
			const rowId = str(
				ro.id ??
					ro.tradeId ??
					ro.transactionId ??
					ro.txHash ??
					ro.orderId,
			);
			const ts = str(ro.timestamp ?? ro.createdAt ?? ro.time ?? ro.date);
			const k = rowId
				? rowId
				: `${v.tokenId}:${ts}:${v.shares}:${v.avgPrice ?? ""}:${v.cost ?? ""}`;
			if (seen.has(k)) continue;
			seen.add(k);
			out.push(v);
			added += 1;
		}
		if (added === 0) break;
		let totalCount: number | null = null;
		if (body && typeof body === "object") {
			const tc = (body as { totalCount?: unknown }).totalCount;
			if (typeof tc === "number" && Number.isFinite(tc) && tc >= 0) {
				totalCount = tc;
			}
		}
		if (rows.length < limit) break;
		if (totalCount !== null && out.length >= totalCount) break;
		const rawNext = (body as { nextCursor?: unknown }).nextCursor;
		const next =
			typeof rawNext === "string" && rawNext.trim().length > 0
				? rawNext.trim()
				: null;
		if (!next) break;
		cursor = next;
	}
	if (import.meta.env.DEV && out.length > 0) {
		const mappedRows = out.slice(0, 20).map((p) => ({
			title: (p.marketTitle ?? "").slice(0, 56),
			outcome: p.outcome,
			marketStatus: p.marketStatus ?? "(missing)",
			resolvedLikeGate: isVenueMarketResolvedLike(p.marketStatus),
			shares: p.shares,
			avgPrice: p.avgPrice,
			cost: p.cost,
			tokenTail: (p.tokenId ?? "").slice(-14),
		}));
		debugLimitlessPortfolioTable(
			"GET portfolio/history — mapped fills (first 20) + resolved-like gate used in usePositionsData",
			mappedRows,
		);
	}
	debugLimitlessPortfolio("trade history pages merged (count)", { rows: out.length });
	return out;
}

export function useLimitlessVenuePositions(enabled: boolean) {
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: limitlessQueryKeys.positionsVenue,
		enabled,
		staleTime: 15_000,
		retry: false,
		queryFn: async () => {
			let raw: unknown;
			try {
				raw = await api.getLimitlessPortfolioPositionsVenue();
			} catch (e) {
				if (isLimitlessRouteUnavailable(e)) {
					return [];
				}
				const msg = e instanceof Error ? e.message : String(e);
				debugLimitlessPortfolio("GET portfolio/positions-venue request failed", {
					message: msg,
				});
				throw e;
			}
			if (!Array.isArray(raw)) return [];
			const out: VenuePosition[] = [];
			for (const row of raw) {
				const v = mapPositionsVenueRow(row);
				if (v) out.push(v);
			}

			if (import.meta.env.DEV && out.length > 0) {
				const rows = out.map((p) => {
					const resolvedLike = isVenueMarketResolvedLike(p.marketStatus);
					const splitBucket = getLimitlessVenueBucket(p);
					const bucket =
						p.marketClosed === false
							? "split→active (market.closed false)"
							: splitBucket === "winnings"
								? "split→limitlessWinnings"
								: splitBucket === "history" && p.redeemPending === true
									? "split→limitlessHistory (resolved; partner redeemable omitted — Claim allowed unless partner sends false)"
									: splitBucket === "history"
										? "split→limitlessHistory (shows under History tab)"
										: "split→active Positions only";
					return {
						bucket,
						splitBucket,
						resolvedLikeApi: resolvedLike,
						marketClosed: p.marketClosed,
						winningOutcomeIndex: p.winningOutcomeIndex,
						marketStatus: p.marketStatus ?? "(missing)",
						redeemable: p.redeemable,
						redeemPending: p.redeemPending === true,
						currentValue: p.currentValue,
						shares: p.shares,
						outcome: p.outcome,
						title: (p.marketTitle ?? "").slice(0, 64),
						slug: p.eventSlug ?? "",
						limitlessGroupSlug: p.limitlessGroupSlug ?? "",
						conditionId: p.conditionId ?? "",
						tokenTail: (p.tokenId ?? "").slice(-14),
					};
				});
				debugLimitlessPortfolioTable(
					"GET portfolio/positions (venue) — each row + where usePositionsData sends it",
					rows,
				);
			}
			return out;
		},
	});
}

export function useLimitlessOpenOrders(enabled: boolean) {
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: limitlessQueryKeys.openOrders,
		enabled,
		staleTime: 10_000,
		retry: false,
		queryFn: async () => {
			let raw: unknown;
			try {
				raw = await api.getLimitlessOpenOrders();
			} catch (e) {
				if (isLimitlessRouteUnavailable(e)) return [];
				throw e;
			}
			if (!Array.isArray(raw)) return [];
			const out: VenueOrder[] = [];
			for (const row of raw) {
				const v = mapOpenOrderRow(row);
				if (v) out.push(v);
			}
			return out;
		},
	});
}

export function useLimitlessTradeHistory(enabled: boolean) {
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: limitlessQueryKeys.portfolioHistory,
		enabled,
		staleTime: 60_000,
		retry: false,
		queryFn: async () => {
			try {
				return await fetchLimitlessTradeHistoryPages((q) =>
					api.getLimitlessPortfolioHistory(q),
				);
			} catch (e) {
				if (isLimitlessRouteUnavailable(e)) return [];
				throw e;
			}
		},
	});
}
