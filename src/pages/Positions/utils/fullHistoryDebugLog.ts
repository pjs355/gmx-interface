import type { Umbrella } from "@/services/api/umbrellaDataService";
import { umbrellaHeaderLabel, stripUmbrellaDisplayPrefix } from "@/helpers/umbrellaDisplayName";
import {
	matchVenuePositionToUmbrellaForHistory,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import type { VenueHistoryFill, VenuePosition } from "@/types/trading/venuePosition";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

export type FullHistoryUnifiedBlock = {
	id: string;
	umbrella: Umbrella;
	venuePositions: VenuePosition[];
	/** Present on History tab blocks from LevelUp resolved umbrellas */
	luMarkets?: Array<{ market: { _id?: string; questionId?: string; marketId?: string; displayName?: string }; yes: string; no: string }>;
};

export type FullHistoryDebugSnapshot = {
	layout: "table" | "card";
	catalogUmbrellaCount: number;
	venueHistoryTradeCount: number;
	unifiedBlockCount: number;
	blocksSummary: Array<{
		blockId: string;
		umbrellaId: string;
		umbrellaRawDisplayName: string;
		blockHeaderLabel: string;
		rowCount: number;
		pandascoreMatchId: string | null;
		syntheticVenueHistBlock: boolean;
		luMarketIds: string[];
		venueTokenIds: string[];
	}>;
	trades: Array<{
		venue: VenuePosition["venue"];
		marketTitle: string;
		outcome: string;
		tokenIdTail: string;
		conditionId: string | null;
		numericMarketId: number | null;
		eventSlug: string | null;
		historySourceId: string | null;
		levelUpUmbrellaId: string | null;
		levelUpUmbrellaDisplayName: string | null;
		resolverUmbrellaId: string | null;
		resolverUmbrellaDisplayName: string | null;
		blockId: string | null;
		blockUmbrellaId: string | null;
		blockHeaderLabel: string | null;
		pandascoreMatchId: string | null;
		blockIsSyntheticVenueHist: boolean;
	}>;
};

const MAX_VERBOSE_VENUE_ROWS = 250;
const MAX_LEVEL_UP_ORDERS_LOG = 500;

/** When History deps refire with the same counts / resolve state, skip repeat console spam. */
let lastHistoryDebugRowsFingerprint = "";
let lastHistoryDebugCatalogFingerprint = "";

function serializeFill(f: VenueHistoryFill): Record<string, unknown> {
	return {
		side: f.side,
		shares: f.shares,
		usdc: f.usdc,
		tradedAt: f.tradedAt,
		sourceId: f.sourceId ?? null,
		price: f.price ?? null,
	};
}

/** Every field we care about for ingestion / History debugging (not UI-truncated). */
export function serializeVenuePositionVerbose(pos: VenuePosition): Record<string, unknown> {
	const fills = pos.historyFills;
	return {
		venue: pos.venue,
		marketTitle: pos.marketTitle,
		outcome: pos.outcome,
		tokenId: pos.tokenId,
		conditionId: pos.conditionId ?? null,
		eventSlug: pos.eventSlug ?? null,
		numericMarketId: pos.numericMarketId ?? null,
		iconUrl: pos.iconUrl ?? null,
		shares: pos.shares,
		avgPrice: pos.avgPrice,
		currentPrice: pos.currentPrice,
		cost: pos.cost,
		currentValue: pos.currentValue,
		pnl: pos.pnl,
		pnlPercent: pos.pnlPercent,
		redeemable: pos.redeemable ?? null,
		marketStatus: pos.marketStatus ?? null,
		marketClosed: pos.marketClosed ?? null,
		winningOutcomeIndex: pos.winningOutcomeIndex ?? null,
		outcomeResult: pos.outcomeResult ?? null,
		historySourceId: pos.historySourceId ?? null,
		historyTradeAt: pos.historyTradeAt ?? null,
		historyTradeSide: pos.historyTradeSide ?? null,
		levelUpUmbrellaId: pos.levelUpUmbrellaId ?? null,
		levelUpUmbrellaDisplayName: pos.levelUpUmbrellaDisplayName ?? null,
		historyFillsCount: fills?.length ?? 0,
		historyFills:
			fills && fills.length > 0 ? fills.map(serializeFill) : undefined,
	};
}

function cappedVerboseVenueRows(rows: VenuePosition[]): {
	rows: Record<string, unknown>[];
	total: number;
	truncated: boolean;
} {
	const total = rows.length;
	const truncated = total > MAX_VERBOSE_VENUE_ROWS;
	const slice = truncated ? rows.slice(0, MAX_VERBOSE_VENUE_ROWS) : rows;
	return {
		rows: slice.map(serializeVenuePositionVerbose),
		total,
		truncated,
	};
}

function serializeLevelUpOrder(o: ProcessedOrder): Record<string, unknown> {
	return {
		orderId: o.orderId,
		questionId: o.questionId,
		tokenId: o.tokenId,
		side: o.side,
		position: o.position,
		price: o.price,
		size: o.size,
		filled: o.filled,
		filledAt: o.filledAt,
		createdAt: o.createdAt,
		usdcValue: o.usdcValue,
		tokenValue: o.tokenValue,
		venue: o.venue ?? "LevelUp",
	};
}

function buildResolvedMarketsCoverage(
	resolved: Record<string, any[]> | undefined,
	orders: ProcessedOrder[] | undefined,
): Array<{
	umbrellaId: string;
	resolvedMarketCount: number;
	withMatchingLevelUpOrder: number;
	missingLevelUpOrder: Array<{ marketId: string; displayName: string }>;
}> | null {
	if (!resolved) return null;
	const orderQids = new Set(
		(orders ?? []).map((o) => String(o.questionId ?? "").trim()).filter(Boolean),
	);
	return Object.entries(resolved).map(([umbrellaId, markets]) => {
		let withOrder = 0;
		const missing: Array<{ marketId: string; displayName: string }> = [];
		for (const m of markets ?? []) {
			const marketId = String(m?._id ?? m?.questionId ?? m?.marketId ?? "").trim();
			if (!marketId) continue;
			if (orderQids.has(marketId)) withOrder++;
			else {
				missing.push({
					marketId,
					displayName: String(
						m?.displayName ?? m?.question ?? m?.umbrellaName ?? "",
					).trim(),
				});
			}
		}
		return {
			umbrellaId,
			resolvedMarketCount: (markets ?? []).length,
			withMatchingLevelUpOrder: withOrder,
			missingLevelUpOrder: missing,
		};
	});
}

function buildUmbrellaBalancesDigest(
	balances: Array<{ umbrella: Umbrella; markets: any[] }> | undefined,
): Array<{
	umbrellaId: string;
	displayName: string;
	positionMarketCount: number;
	marketIds: string[];
}> | null {
	if (!balances) return null;
	return balances.map((row) => ({
		umbrellaId: row.umbrella._id,
		displayName: row.umbrella.displayName ?? "",
		positionMarketCount: row.markets?.length ?? 0,
		marketIds: (row.markets ?? [])
			.map((mp: any) => {
				const m = mp?.market ?? mp;
				return String(m?._id ?? m?.questionId ?? m?.marketId ?? "").trim();
			})
			.filter(Boolean),
	}));
}

function snapshot(
	layout: "table" | "card",
	venueHistory: VenuePosition[],
	unifiedBlocks: FullHistoryUnifiedBlock[],
	umbrellas: Umbrella[],
	umbrellaLookupByConditionId: Map<string, Umbrella>,
	predictLookup: PredictUmbrellaLookup | null,
	dflowMintLookup: Map<string, Umbrella> | null | undefined,
	dflowEventTickerLookup: Map<string, Umbrella> | null | undefined,
): FullHistoryDebugSnapshot {
	const trades = venueHistory.map((pos) => {
		const predictHint =
			pos.venue === "predictfun"
				? stripUmbrellaDisplayPrefix(pos.marketTitle) || undefined
				: undefined;
		const resolverUmbrella = matchVenuePositionToUmbrellaForHistory(
			pos,
			pos.venue,
			umbrellaLookupByConditionId,
			umbrellas,
			predictLookup,
			predictHint,
			dflowMintLookup ?? null,
			dflowEventTickerLookup ?? null,
		);
		const containingBlock = unifiedBlocks.find((b) => b.venuePositions.includes(pos));
		const umb = containingBlock?.umbrella;
		const token = pos.tokenId ?? "";
		const tokenIdTail = token.length > 14 ? `…${token.slice(-12)}` : token;
		return {
			venue: pos.venue,
			marketTitle: pos.marketTitle,
			outcome: pos.outcome,
			tokenIdTail,
			conditionId: pos.conditionId ?? null,
			numericMarketId: pos.numericMarketId ?? null,
			eventSlug: pos.eventSlug ?? null,
			dflowEventTicker: pos.dflowEventTicker ?? null,
			historySourceId: pos.historySourceId ?? null,
			levelUpUmbrellaId: pos.levelUpUmbrellaId ?? null,
			levelUpUmbrellaDisplayName: pos.levelUpUmbrellaDisplayName ?? null,
			resolverUmbrellaId: resolverUmbrella?._id ?? null,
			resolverUmbrellaDisplayName: resolverUmbrella?.displayName ?? null,
			blockId: containingBlock?.id ?? null,
			blockUmbrellaId: umb?._id ?? null,
			blockHeaderLabel: umb ? umbrellaHeaderLabel(umb) : null,
			pandascoreMatchId:
				(umb as { pandascore_matchId?: string } | undefined)?.pandascore_matchId ??
				null,
			blockIsSyntheticVenueHist: containingBlock?.id?.startsWith("venue-hist-") ?? false,
		};
	});

	return {
		layout,
		catalogUmbrellaCount: umbrellas.length,
		venueHistoryTradeCount: venueHistory.length,
		unifiedBlockCount: unifiedBlocks.length,
		blocksSummary: unifiedBlocks.map((b) => {
			const lu = b.luMarkets ?? [];
			const luMarketIds = lu
				.map((lm) => {
					const m = lm.market;
					return String(m?._id ?? m?.questionId ?? m?.marketId ?? "").trim();
				})
				.filter(Boolean);
			return {
				blockId: b.id,
				umbrellaId: b.umbrella._id,
				umbrellaRawDisplayName: b.umbrella.displayName,
				blockHeaderLabel: umbrellaHeaderLabel(b.umbrella),
				rowCount: b.venuePositions.length,
				pandascoreMatchId:
					(b.umbrella as { pandascore_matchId?: string }).pandascore_matchId ?? null,
				syntheticVenueHistBlock: b.id.startsWith("venue-hist-"),
				luMarketIds,
				venueTokenIds: b.venuePositions.map((p) => p.tokenId),
			};
		}),
		trades,
	};
}

export type LogFullHistoryDebugParams = {
	layout: "table" | "card";
	venueHistory: VenuePosition[];
	unifiedBlocks: FullHistoryUnifiedBlock[];
	umbrellas: Umbrella[];
	umbrellaLookupByConditionId: Map<string, Umbrella>;
	predictLookup: PredictUmbrellaLookup | null;
	/** Same map as `buildUmbrellaLookupByDflowOutcomeMint(umbrellas)` — optional for debug parity. */
	dflowMintLookup?: Map<string, Umbrella> | null;
	/** Same map as `buildUmbrellaLookupByDflowEventTicker(umbrellas)`. */
	dflowEventTickerLookup?: Map<string, Umbrella> | null;
	/** `combinedOrders` from Positions — LevelUp + venue rows used for History cash-flow */
	orders?: ProcessedOrder[];
	resolvedMarketsByUmbrella?: Record<string, any[]>;
	/** Positions-tab umbrella rows (shows which LevelUp umbrellas/markets exist vs History) */
	umbrellaBalances?: Array<{ umbrella: Umbrella; markets: any[] }>;
	/** Pre–umbrella-resolve merge from `usePositionsData` (includes rows dropped or rewritten by resolve) */
	venueHistoryRawItems?: VenuePosition[];
	/** `POST /api/umbrellas/resolve-venue-history` + merged row id counts (next to `venueIngest.displayedPipelineVerbose`) */
	resolveStage?: {
		batchFetchStatus: string;
		batchIsSuccess: boolean;
		batchIsError: boolean;
		queryCount: number;
		rowCountTotal: number;
		rowCountWithLevelUpUmbrellaId: number;
	} | null;
};

/** Dev-only: merged venue history + orders + resolve stage. Requires `VITE_DEBUG_TRADING=true` (`isTradingDebugLoggingEnabled`). */
export function logFullHistoryDebug(params: LogFullHistoryDebugParams): void {
	if (!import.meta.env.DEV) return;
	if (!isTradingDebugLoggingEnabled()) return;

	const snap = snapshot(
		params.layout,
		params.venueHistory,
		params.unifiedBlocks,
		params.umbrellas,
		params.umbrellaLookupByConditionId,
		params.predictLookup,
		params.dflowMintLookup,
		params.dflowEventTickerLookup,
	);

	const orders = params.orders ?? [];
	const ordersLu = orders.filter(
		(o) => !o.venue || String(o.venue).toLowerCase() === "levelup",
	);
	const ordersOtherVenue = orders.filter(
		(o) => o.venue && String(o.venue).toLowerCase() !== "levelup",
	);

	const ordersSerialized = orders
		.slice(0, MAX_LEVEL_UP_ORDERS_LOG)
		.map(serializeLevelUpOrder);
	const ordersTruncated = orders.length > MAX_LEVEL_UP_ORDERS_LOG;

	const rowsFingerprint = [
		params.layout,
		snap.venueHistoryTradeCount,
		snap.unifiedBlockCount,
		orders.length,
		params.venueHistoryRawItems?.length ?? "",
		params.resolveStage?.rowCountTotal ?? "",
		params.resolveStage?.batchFetchStatus ?? "",
		params.resolveStage?.queryCount ?? "",
	].join("|");

	const catalogFingerprint = params.umbrellas
		.map((u) => String(u._id))
		.sort()
		.join(",");

	const payload = {
		...snap,
		lookupEngine: {
			umbrellaLookupByConditionIdSize: params.umbrellaLookupByConditionId.size,
			predictLookupPresent: params.predictLookup != null,
			dflowMintLookupSize: params.dflowMintLookup?.size ?? 0,
			dflowEventTickerLookupSize: params.dflowEventTickerLookup?.size ?? 0,
		},
		levelUpAndOrders: {
			combinedOrdersTotal: orders.length,
			levelUpOrdersCount: ordersLu.length,
			nonLevelUpVenueOrdersInCombined: ordersOtherVenue.length,
			ordersSerialized,
			ordersTruncated,
			ordersOmittedCount: ordersTruncated ? orders.length - MAX_LEVEL_UP_ORDERS_LOG : 0,
		},
		umbrellaCatalogSummary: params.umbrellas.map((u) => ({
			_id: u._id,
			displayName: u.displayName,
			childCount: Array.isArray(u.children) ? u.children.length : 0,
			originalChildCount: Array.isArray(u.originalChildren)
				? u.originalChildren.length
				: 0,
		})),
		resolvedMarketsCoverage: buildResolvedMarketsCoverage(
			params.resolvedMarketsByUmbrella,
			orders,
		),
		umbrellaBalancesPositions: buildUmbrellaBalancesDigest(params.umbrellaBalances),
		venueIngest: {
			displayedPipelineCount: params.venueHistory.length,
			displayedPipelineVerbose: cappedVerboseVenueRows(params.venueHistory),
			rawPreResolveCount: params.venueHistoryRawItems?.length ?? null,
			rawPreResolveVerbose: params.venueHistoryRawItems
				? cappedVerboseVenueRows(params.venueHistoryRawItems)
				: null,
		},
		...(params.resolveStage != null ? { resolveStage: params.resolveStage } : {}),
	};

	if (rowsFingerprint !== lastHistoryDebugRowsFingerprint) {
		lastHistoryDebugRowsFingerprint = rowsFingerprint;
		// eslint-disable-next-line no-console -- intentional History tab diagnostic
		console.groupCollapsed(
			`[History] FULL_HISTORY · rows=${snap.venueHistoryTradeCount} · blocks=${snap.unifiedBlockCount} · orders=${orders.length} (expand)`,
		);
		// eslint-disable-next-line no-console -- intentional History tab diagnostic
		console.info(payload);
		// eslint-disable-next-line no-console -- intentional History tab diagnostic
		console.info(
			"[History] Full `exchangeMatching` + children: open UMBRELLAS_FULL group (logged once per catalog id set).",
		);
		// eslint-disable-next-line no-console -- intentional History tab diagnostic
		console.groupEnd();
	}

	if (catalogFingerprint !== lastHistoryDebugCatalogFingerprint) {
		lastHistoryDebugCatalogFingerprint = catalogFingerprint;
		const predictLinked = params.umbrellas.filter(
			(u) =>
				u.exchangeMatching != null &&
				typeof (u.exchangeMatching as { predictFun?: unknown }).predictFun === "object",
		);
		// eslint-disable-next-line no-console -- full catalog for inverse-resolve / exchangeMatching inspection
		console.groupCollapsed(
			`[History] UMBRELLAS_FULL · count=${params.umbrellas.length} · predictLinked=${predictLinked.length} (expand)`,
		);
		// eslint-disable-next-line no-console -- full catalog for inverse-resolve / exchangeMatching inspection
		console.info({
			note: "In-memory umbrellas (catalog + resolve merge). `all` is the full tree.",
			count: params.umbrellas.length,
			predictFunLinkedCount: predictLinked.length,
			all: params.umbrellas,
			predictLinkedOnly: predictLinked,
		});
		// eslint-disable-next-line no-console -- full catalog for inverse-resolve / exchangeMatching inspection
		console.groupEnd();
	}
}
