import { useQuery } from "@tanstack/react-query";
import {
	type VenueOrder,
	type VenuePosition,
	isVenueMarketResolvedLike,
	venueDisplayLabel,
} from "@/types/trading/venuePosition";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { limitlessQueryKeys } from "./limitlessQueryKeys";
import { canonicalLimitlessTokenId } from "./limitlessTokenId";
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

/**
 * Normalizes rows from our proxy `GET /api/limitless/portfolio/positions-venue`, which mirrors
 * Limitless `GET /portfolio/positions` (`clob` + `amm` — see
 * [Portfolio & Positions](https://docs.limitless.exchange/developers/sdk/typescript/portfolio) and
 * [AMM positions](https://docs.limitless.exchange/developers/sdk/typescript/portfolio#amm-positions)).
 * Limitless also notes that `RESOLVED` on a market does not guarantee on-chain payout yet —
 * [Get Positions](https://docs.limitless.exchange/api-reference/portfolio/positions).
 */
function mapPositionsVenueRow(raw: unknown): VenuePosition | null {
	if (!raw || typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	const tokenId = canonicalLimitlessTokenId(str(o.tokenId));
	if (!tokenId) return null;
	const shares = num(o.shares);
	if (shares <= 0) return null;
	const slug = str(o.marketSlug);
	const status = str(o.marketStatus);
	const redeemable = o.redeemable === true;
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
		redeemable,
		marketStatus: status || undefined,
	};
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
	getHistory: (q: { limit: number; page: number }) => Promise<unknown>,
): Promise<VenuePosition[]> {
	const limit = 50;
	const out: VenuePosition[] = [];
	const seen = new Set<string>();
	/** Partner history is paginated; cap pages to avoid unbounded load (50 rows × 100 = 5000 max). */
	const maxHistoryPages = 100;
	for (let page = 1; page <= maxHistoryPages; page++) {
		const body = await getHistory({ limit, page });
		const rows = extractHistoryArray(body);
		if (rows.length === 0) break;
		if (import.meta.env.DEV && page === 1 && rows[0]) {
			debugLimitlessShallowRowShape("GET portfolio/history page=1 first raw row", rows[0]);
		}
		let totalCount: number | null = null;
		if (body && typeof body === "object") {
			const tc = (body as { totalCount?: unknown }).totalCount;
			if (typeof tc === "number" && Number.isFinite(tc) && tc >= 0) {
				totalCount = tc;
			}
		}
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
		}
		if (rows.length < limit) break;
		if (totalCount !== null && page * limit >= totalCount) break;
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
		queryFn: async () => {
			const raw = await api.getLimitlessPortfolioPositionsVenue();
			if (!Array.isArray(raw)) return [];
			const out: VenuePosition[] = [];
			for (const row of raw) {
				const v = mapPositionsVenueRow(row);
				if (v) out.push(v);
			}
			if (import.meta.env.DEV && out.length > 0) {
				const rows = out.map((p) => {
					const resolvedLike = isVenueMarketResolvedLike(p.marketStatus);
					const bucket =
						p.marketClosed === false
							? "split→active (market.closed false)"
							: resolvedLike && p.redeemable && (p.currentValue ?? 0) > 0
								? "split→limitlessWinnings"
								: resolvedLike
									? "split→limitlessHistory (shows under History tab)"
									: "split→active Positions only";
					return {
						bucket,
						resolvedLikeApi: resolvedLike,
						marketClosed: p.marketClosed,
						winningOutcomeIndex: p.winningOutcomeIndex,
						marketStatus: p.marketStatus ?? "(missing)",
						redeemable: p.redeemable,
						currentValue: p.currentValue,
						shares: p.shares,
						outcome: p.outcome,
						title: (p.marketTitle ?? "").slice(0, 64),
						slug: p.eventSlug ?? "",
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
		queryFn: async () => {
			const raw = await api.getLimitlessOpenOrders();
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
		queryFn: () =>
			fetchLimitlessTradeHistoryPages((q) =>
				api.getLimitlessPortfolioHistory(q),
			),
	});
}
