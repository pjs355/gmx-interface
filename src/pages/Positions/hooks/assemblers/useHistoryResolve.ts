import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import { getPrivateApiBaseUrl } from "@/config/privateApiBase";
import {
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
	lookupUmbrellaByDflowEventTicker,
} from "@/trading/dflow/dflowUmbrellaLookup";
import {
	buildUmbrellaLookupByPolymarketConditionId,
	polymarketConditionIdForResolveWire,
	polymarketConditionLookupKey,
} from "@/trading/polymarket/polymarketConditionLookup";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { PredictMatchEventRow } from "@/trading/predict/predictMatchesApi";
import {
	buildPredictUmbrellaLookup,
	resolvePredictUmbrellaForDisplay,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import {
	type UmbrellaExchangeResolveQuery,
	shouldRequestVenueHistoryUmbrellaResolve,
	venueHistoryExchangeResolveKey,
	venuePositionToResolveQuery,
} from "@/trading/umbrellaVenueResolveKey";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	shortPredictFunMarketTitleForPortfolio,
	stripUmbrellaDisplayPrefix,
} from "@/helpers/umbrellaDisplayName";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import {
	UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES,
	postUmbrellaResolveExchangeKeysChunked,
} from "../venues/shared/postUmbrellaResolveExchangeKeysChunked";

type PrivateApi = ReturnType<typeof usePrivateApiClient>;

export type HistoryResolveStage = {
	batchFetchStatus: "fetching" | "paused" | "idle";
	batchIsSuccess: boolean;
	batchIsError: boolean;
	queryCount: number;
	rowCountTotal: number;
	rowCountWithLevelUpUmbrellaId: number;
};

/**
 * Diagnostic inputs forwarded to the opt-in `[venueHistorySources]` log
 * (`VITE_DEBUG_VENUE_HISTORY_SOURCES=1`). Kept as count-shaped primitives so a new array
 * reference from a venue trade-history query does not flip the source-counts fingerprint.
 */
export type HistoryResolveDiagInputs = {
	polyTradeHistoryRows: VenuePosition[] | undefined;
	limitlessTradeHistoryCount: number;
	predictFilledOrdersCount: number;
	predictMatchEventCount: number;
};

export type UseHistoryResolveArgs = {
	venueHistoryRawItems: VenuePosition[];
	umbrellas: Umbrella[];
	appStateMarkets: MatchedMarket[] | null | undefined;
	predictMarketDetails: Map<number, PredictMarketDetail>;
	authenticated: boolean;
	effectiveAccount: string | null;
	privateApi: PrivateApi;
	diag: HistoryResolveDiagInputs;
};

export type UseHistoryResolveResult = {
	venueHistoryResolveQueries: UmbrellaExchangeResolveQuery[];
	historyCatalogUmbrellas: Umbrella[];
	venueHistory: VenuePosition[];
	historyResolveStage: HistoryResolveStage;
	historyUmbrellaResolveSettled: boolean;
};

/**
 * History tab umbrella-resolve pipeline:
 *
 *   1. Build resolve queries from `venueHistoryRawItems` (Predict / Polymarket / DFlow keys).
 *   2. Fire `POST /api/umbrellas/resolve-venue-history` (chunked + cached via TanStack Query;
 *      `keepPreviousData` lets the prior batch render while the new one is in flight).
 *   3. Merge resolved umbrella payloads into `historyCatalogUmbrellas` (catalog ∪ resolved).
 *   4. Patch each `venueHistoryRawItems` row with its resolved `levelUpUmbrellaId` /
 *      `levelUpUmbrellaDisplayName` / display title (`venueHistory`).
 *   5. Expose `historyResolveStage` (status counts) and `historyUmbrellaResolveSettled`
 *      (single boolean for History-tab shell readiness).
 *
 * Two diagnostics are env-gated and run inline (kept here to avoid duplicating state):
 *   - `VITE_DEBUG_VENUE_HISTORY_SOURCES=1` — venue-history source counts.
 *   - `VITE_DEBUG_FULL_HISTORY_RESOLVE=1` — full resolve outcome (incl. partial-hit classify).
 *     The `historyVenueUmbrellaResolveQuery.isError` warn always logs in dev so a failed
 *     batch is visible without enabling the verbose flag.
 */
export function useHistoryResolve(
	args: UseHistoryResolveArgs,
): UseHistoryResolveResult {
	const {
		venueHistoryRawItems,
		umbrellas,
		appStateMarkets,
		predictMarketDetails,
		authenticated,
		effectiveAccount,
		privateApi,
		diag,
	} = args;

	const venueHistoryResolveQueries = useMemo(() => {
		const seen = new Set<string>();
		const out: UmbrellaExchangeResolveQuery[] = [];
		for (const item of venueHistoryRawItems) {
			if (!shouldRequestVenueHistoryUmbrellaResolve(item)) continue;
			const k = venueHistoryExchangeResolveKey(item);
			if (!k || seen.has(k)) continue;
			seen.add(k);
			const q = venuePositionToResolveQuery(item, k);
			if (q) out.push(q);
		}
		return out;
	}, [venueHistoryRawItems]);

	/** Order-independent payload fingerprint so query identity does not churn on row order alone. */
	const venueHistoryResolveQueriesKeyStable = useMemo(() => {
		try {
			return JSON.stringify(
				[...venueHistoryResolveQueries].sort((a, b) =>
					String(a.clientKey ?? "").localeCompare(String(b.clientKey ?? "")),
				),
			);
		} catch {
			return String(venueHistoryResolveQueries.length);
		}
	}, [venueHistoryResolveQueries]);

	/**
	 * Opt-in (`VITE_DEBUG_VENUE_HISTORY_SOURCES=1`): merged venue-history source sizes. Fingerprinted
	 * (counts + resolve batch size) — not `venueHistoryRawItems` identity — because Poly/Predict/
	 * Limitless queries often produce a new array reference on each tick while counts are unchanged.
	 */
	const venueHistorySourcesDebugFingerprintRef = useRef("");

	useEffect(() => {
		if (import.meta.env.VITE_DEBUG_VENUE_HISTORY_SOURCES !== "1") return;
		const poly = diag.polyTradeHistoryRows ?? [];
		let polyWon = 0;
		for (const p of poly) {
			if (p.venue === "polymarket" && p.outcomeResult === "WON") polyWon++;
		}
		const fp = [
			venueHistoryRawItems.length,
			diag.predictFilledOrdersCount,
			diag.predictMatchEventCount,
			poly.length,
			polyWon,
			diag.limitlessTradeHistoryCount,
			venueHistoryResolveQueries.length,
		].join(":");
		if (fp === venueHistorySourcesDebugFingerprintRef.current) return;
		venueHistorySourcesDebugFingerprintRef.current = fp;
		console.debug("[venueHistorySources]", {
			rawItemCount: venueHistoryRawItems.length,
			predictFilledOrders: diag.predictFilledOrdersCount,
			predictMatchEvents: diag.predictMatchEventCount,
			polyActivityRows: poly.length,
			polyActivityOutcomeWon: polyWon,
			limitlessHistoryApiRows: diag.limitlessTradeHistoryCount,
			historyResolveQueryCount: venueHistoryResolveQueries.length,
		});
	}, [
		venueHistoryRawItems.length,
		diag.predictFilledOrdersCount,
		diag.predictMatchEventCount,
		diag.polyTradeHistoryRows,
		diag.limitlessTradeHistoryCount,
		venueHistoryResolveQueries.length,
	]);

	const historyVenueUmbrellaResolveQuery = useQuery({
		queryKey: [
			"umbrella-resolve-venue-history",
			"payloads",
			venueHistoryResolveQueriesKeyStable,
		],
		queryFn: async () =>
			postUmbrellaResolveExchangeKeysChunked(
				(body) =>
					privateApi.postUmbrellaResolveVenueHistory({
						queries: body.queries,
					}),
				venueHistoryResolveQueries,
			),
		enabled:
			Boolean(authenticated && effectiveAccount && venueHistoryResolveQueries.length > 0),
		placeholderData: keepPreviousData,
		staleTime: 300_000,
		retry: 1,
	});

	/** Active catalog + resolved inactive umbrellas from History `POST /api/umbrellas/resolve-venue-history` payloads. */
	const historyCatalogUmbrellas = useMemo(() => {
		const byId = new Map<string, Umbrella>();
		for (const u of umbrellas) {
			byId.set(String(u._id), u);
		}
		const raw = historyVenueUmbrellaResolveQuery.data;
		const payloads =
			raw && raw.success && raw.data?.umbrellasById ? raw.data.umbrellasById : undefined;
		if (payloads) {
			for (const [id, doc] of Object.entries(payloads)) {
				if (doc && typeof doc === "object") {
					byId.set(id, doc as Umbrella);
				}
			}
		}
		return Array.from(byId.values());
	}, [umbrellas, historyVenueUmbrellaResolveQuery.data]);

	const umbrellaLookupByConditionIdForHistory = useMemo(
		() => buildUmbrellaLookupByPolymarketConditionId(historyCatalogUmbrellas),
		[historyCatalogUmbrellas],
	);

	/** DFlow outcome mint → umbrella (exchangeMatching.dflow yes/no mints), incl. resolve payloads. */
	const umbrellaLookupByDflowMintForHistory = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(historyCatalogUmbrellas),
		[historyCatalogUmbrellas],
	);

	const umbrellaLookupByDflowEventTickerForHistory = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(historyCatalogUmbrellas),
		[historyCatalogUmbrellas],
	);

	const predictUmbrellaLookupForHistory = useMemo(
		() => buildPredictUmbrellaLookup(appStateMarkets, historyCatalogUmbrellas),
		[appStateMarkets, historyCatalogUmbrellas],
	);

	/**
	 * Dev-only FULL_HISTORY_RESOLVE logging: `partial_hits` means some `clientKey`s have no
	 * `umbrellaId` in the resolve response (Mongo / exchangeMatching catalog gap)—not a stuck
	 * resolve or History loading latch; rows still render with synthetic/unmatched grouping.
	 * TanStack refetch-on-window-focus replays the same payload and used to spam `console.warn`,
	 * which Sentry surfaces as errors; we fingerprint identical outcomes and log partials at
	 * `info` so focus refetch does not look like a recurring failure.
	 *
	 * Console output is opt-in: set `VITE_DEBUG_FULL_HISTORY_RESOLVE=1` (errors still log in dev).
	 */
	const fullHistoryResolveDiagFingerprintRef = useRef("");

	useEffect(() => {
		if (!import.meta.env.DEV) return;

		if (historyVenueUmbrellaResolveQuery.isError) {
			// eslint-disable-next-line no-console -- History batch-resolve diagnostic
			console.warn(
				"[FULL_HISTORY_RESOLVE] POST /api/umbrellas/resolve-venue-history failed",
				{
					privateApiBase: getPrivateApiBaseUrl(),
					error: historyVenueUmbrellaResolveQuery.error,
				},
			);
			return;
		}

		if (import.meta.env.VITE_DEBUG_FULL_HISTORY_RESOLVE !== "1") return;

		const d = historyVenueUmbrellaResolveQuery.data;
		const oldGateWouldSkip = venueHistoryRawItems.filter(
			(p) =>
				Boolean(p.levelUpUmbrellaDisplayName?.trim()) &&
				!p.levelUpUmbrellaId?.trim() &&
				venueHistoryExchangeResolveKey(p) != null,
		).length;
		if (d?.success && venueHistoryResolveQueries.length > 0) {
			const by = d.data?.byClientKey ?? {};
			const hits = venueHistoryResolveQueries.filter(
				(x) => by[x.clientKey]?.umbrellaId || by[x.clientKey]?.displayName,
			);
			const missKeys = venueHistoryResolveQueries
				.map((q) => q.clientKey)
				.filter((ck) => !by[ck]?.umbrellaId);
			const umbrellaIdHits = venueHistoryResolveQueries.filter(
				(x) => by[x.clientKey]?.umbrellaId,
			).length;
			const classify =
				umbrellaIdHits === 0
					? "all_miss_or_empty_hits"
					: missKeys.length === 0
						? "all_hits"
						: "partial_hits";
			const diagFp = `${classify}:${venueHistoryResolveQueries.length}:${[...missKeys].sort().join("\0")}`;
			if (diagFp === fullHistoryResolveDiagFingerprintRef.current) return;
			fullHistoryResolveDiagFingerprintRef.current = diagFp;

			const payloads = d.data?.umbrellasById;
			const payloadIdCount = payloads ? Object.keys(payloads).length : 0;
			const predictRowsMissingResolveClientKey = venueHistoryRawItems.filter(
				(p) =>
					p.venue === "predictfun" &&
					!p.levelUpUmbrellaId?.trim() &&
					venueHistoryExchangeResolveKey(p) == null,
			).length;
			const resolveRequestChunkCount = Math.ceil(
				venueHistoryResolveQueries.length / UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES,
			);
			// eslint-disable-next-line no-console -- History batch-resolve diagnostic
			console.info("[FULL_HISTORY_RESOLVE]", {
				privateApiBase: getPrivateApiBaseUrl(),
				queryCount: venueHistoryResolveQueries.length,
				resolveRequestChunkCount,
				classify,
				sampleQueries: venueHistoryResolveQueries.slice(0, 8).map((q) => ({
					venue: q.venue,
					clientKey:
						q.clientKey.length > 96 ? `${q.clientKey.slice(0, 96)}…` : q.clientKey,
					conditionId: q.conditionId
						? q.conditionId.length > 22
							? `${q.conditionId.slice(0, 22)}…`
							: q.conditionId
						: undefined,
					numericMarketId: q.numericMarketId,
					dflowEventTicker: q.dflowEventTicker,
					tokenIdPresent: Boolean(q.tokenId?.trim()),
				})),
				byClientKeyEntryCount: Object.keys(by).length,
				rowsWithUmbrellaIdInResponse: umbrellaIdHits,
				missKeyCount: missKeys.length,
				missKeysSample: missKeys.slice(0, 16),
				...(missKeys.length > 0
					? {
							partialHitsNote:
								"Some keys have no umbrellaId in resolve (catalog gap); labels may stay generic.",
							missKeysExtraSample: missKeys.slice(16, 36),
						}
					: {}),
				umbrellasByIdCount: payloadIdCount,
				rawVenueHistoryCount: venueHistoryRawItems.length,
				predictRowsMissingResolveClientKey,
				/** Rows that previously skipped batch resolve when only displayName was set (fixed gate). */
				oldGateWouldSkipDisplayNameWithoutId: oldGateWouldSkip,
			});
			if (hits.length === 0) {
				// eslint-disable-next-line no-console -- History batch-resolve diagnostic
				console.warn(
					"[FULL_HISTORY_RESOLVE] batch OK but zero umbrella hits",
					{
						keyCount: venueHistoryResolveQueries.length,
						sampleKeys: venueHistoryResolveQueries
							.map((x) => x.clientKey)
							.slice(0, 12),
					},
				);
			}
		} else if (d?.success) {
			const predictRowsMissingResolveClientKey = venueHistoryRawItems.filter(
				(p) =>
					p.venue === "predictfun" &&
					!p.levelUpUmbrellaId?.trim() &&
					venueHistoryExchangeResolveKey(p) == null,
			).length;
			if (predictRowsMissingResolveClientKey > 0) {
				// eslint-disable-next-line no-console -- History batch-resolve diagnostic
				console.info(
					"[FULL_HISTORY_RESOLVE] no resolve queries; Predict rows lack numericMarketId+tokenKey for POST",
					{
						predictRowsMissingResolveClientKey,
						rawVenueHistoryCount: venueHistoryRawItems.length,
					},
				);
			}
		}
	}, [
		venueHistoryRawItems,
		historyVenueUmbrellaResolveQuery.data,
		historyVenueUmbrellaResolveQuery.isError,
		historyVenueUmbrellaResolveQuery.error,
		venueHistoryResolveQueries,
	]);

	const venueHistory = useMemo(() => {
		const raw = historyVenueUmbrellaResolveQuery.data;
		const batch =
			raw && typeof raw === "object" && raw.success && raw.data?.byClientKey
				? raw.data.byClientKey
				: undefined;
		const payloads =
			raw && raw.success && raw.data?.umbrellasById ? raw.data.umbrellasById : undefined;

		/** Polymarket wire lookup key → umbrellaId from batch, keyed by resolve `conditionId` (not catalog re-index). */
		const polyWireToUmbrellaIdFromBatch = new Map<string, string>();
		if (batch && venueHistoryResolveQueries.length > 0) {
			for (const q of venueHistoryResolveQueries) {
				if (q.venue !== "polymarket") continue;
				const cid = q.conditionId?.trim();
				if (!cid) continue;
				const hit = batch[q.clientKey];
				const uid = hit?.umbrellaId?.trim();
				if (!uid) continue;
				const wire = polymarketConditionIdForResolveWire(cid);
				const lk = wire ? polymarketConditionLookupKey(wire) : "";
				if (lk) polyWireToUmbrellaIdFromBatch.set(lk, uid);
			}
		}

		let rows = venueHistoryRawItems;
		if (batch && Object.keys(batch).length > 0) {
			rows = venueHistoryRawItems.map((item) => {
				const k = venueHistoryExchangeResolveKey(item);
				if (!k) return item;
				const hit = batch[k];
				if (!hit?.displayName && !hit?.umbrellaId) return item;
				const display = stripUmbrellaDisplayPrefix(hit.displayName ?? "").trim();
				const existingId = item.levelUpUmbrellaId?.trim();
				const hitId = hit.umbrellaId?.trim();
				return {
					...item,
					levelUpUmbrellaId: existingId || hitId || item.levelUpUmbrellaId,
					levelUpUmbrellaDisplayName:
						item.levelUpUmbrellaDisplayName?.trim() || hit.displayName,
					...(display ? { marketTitle: display } : {}),
				};
			});
		}

		if (polyWireToUmbrellaIdFromBatch.size > 0) {
			rows = rows.map((item) => {
				if (item.venue !== "polymarket") return item;
				if (item.levelUpUmbrellaId?.trim()) return item;
				const wire = polymarketConditionIdForResolveWire(item.conditionId ?? "");
				const lk = wire ? polymarketConditionLookupKey(wire) : "";
				const uid = lk ? polyWireToUmbrellaIdFromBatch.get(lk) : undefined;
				if (!uid) return item;
				const doc = payloads?.[uid] as Umbrella | undefined;
				const dn = doc?.displayName
					? stripUmbrellaDisplayPrefix(doc.displayName).trim()
					: "";
				return {
					...item,
					levelUpUmbrellaId: uid,
					...(doc?.displayName && !item.levelUpUmbrellaDisplayName?.trim()
						? { levelUpUmbrellaDisplayName: doc.displayName }
						: {}),
					...(dn && dn !== item.marketTitle ? { marketTitle: dn } : {}),
				};
			});
		}

		return rows.map((item) => {
			if (item.venue === "polymarket" && item.conditionId?.trim()) {
				const wire = polymarketConditionIdForResolveWire(item.conditionId);
				const key = wire ? polymarketConditionLookupKey(wire) : "";
				const u = key ? umbrellaLookupByConditionIdForHistory.get(key) : undefined;
				if (u?.displayName?.trim()) {
					const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
					const idPatch: Partial<VenuePosition> = {};
					if (!item.levelUpUmbrellaId?.trim()) {
						idPatch.levelUpUmbrellaId = u._id;
						if (!item.levelUpUmbrellaDisplayName?.trim()) {
							idPatch.levelUpUmbrellaDisplayName = u.displayName;
						}
					}
					if (dn && dn !== item.marketTitle) {
						return { ...item, ...idPatch, marketTitle: dn };
					}
					if (Object.keys(idPatch).length > 0) {
						return { ...item, ...idPatch };
					}
				}
			}
			/* DFlow venue-history row patch: event ticker then mint (same contract as `matchVenuePositionToUmbrella`). */
			if (item.venue === "dflow") {
				const et = item.dflowEventTicker?.trim();
				let u = et
					? lookupUmbrellaByDflowEventTicker(
							et,
							umbrellaLookupByDflowEventTickerForHistory,
							historyCatalogUmbrellas,
						)
					: undefined;
				if (!u && item.tokenId?.trim()) {
					u = umbrellaLookupByDflowMintForHistory.get(item.tokenId.trim());
				}
				if (u?.displayName?.trim()) {
					const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
					const idPatch: Partial<VenuePosition> = {};
					if (!item.levelUpUmbrellaId?.trim()) {
						idPatch.levelUpUmbrellaId = u._id;
						if (!item.levelUpUmbrellaDisplayName?.trim()) {
							idPatch.levelUpUmbrellaDisplayName = u.displayName;
						}
					}
					if (dn && dn !== item.marketTitle) {
						return { ...item, ...idPatch, marketTitle: dn };
					}
					if (Object.keys(idPatch).length > 0) {
						return { ...item, ...idPatch };
					}
					return item;
				}
				const apiTitle = stripUmbrellaDisplayPrefix(
					item.levelUpUmbrellaDisplayName ?? "",
				).trim();
				if (apiTitle && apiTitle !== item.marketTitle) {
					return { ...item, marketTitle: apiTitle };
				}
				return item;
			}
			if (item.venue !== "predictfun") return item;
			const apiTitle = stripUmbrellaDisplayPrefix(
				item.levelUpUmbrellaDisplayName ?? "",
			).trim();
			if (apiTitle) {
				if (item.marketTitle === apiTitle && item.levelUpUmbrellaId?.trim()) {
					return item;
				}
				if (item.marketTitle !== apiTitle) {
					return { ...item, marketTitle: apiTitle };
				}
				// Title already matches API label but umbrella id may still be missing — fall through.
			}
			const histDetail =
				item.numericMarketId != null
					? predictMarketDetails.get(item.numericMarketId)
					: undefined;
			const histHint =
				(histDetail?.question ?? histDetail?.title ?? "").trim() || undefined;
			const u = resolvePredictUmbrellaForDisplay(
				item,
				predictUmbrellaLookupForHistory,
				historyCatalogUmbrellas,
				histHint,
			);
			if (!u?.displayName?.trim()) {
				const raw = (histHint ?? item.marketTitle ?? "").trim();
				const short = shortPredictFunMarketTitleForPortfolio(raw);
				if (short && short !== item.marketTitle) return { ...item, marketTitle: short };
				return item;
			}
			const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
			if (!dn) {
				const raw = (histHint ?? item.marketTitle ?? "").trim();
				const short = shortPredictFunMarketTitleForPortfolio(raw);
				if (short && short !== item.marketTitle) return { ...item, marketTitle: short };
				return item;
			}
			const idPatch: Partial<VenuePosition> = {};
			if (!item.levelUpUmbrellaId?.trim()) {
				idPatch.levelUpUmbrellaId = u._id;
				if (!item.levelUpUmbrellaDisplayName?.trim()) {
					idPatch.levelUpUmbrellaDisplayName = u.displayName;
				}
			}
			if (dn !== item.marketTitle) {
				return { ...item, ...idPatch, marketTitle: dn };
			}
			if (Object.keys(idPatch).length > 0) {
				return { ...item, ...idPatch };
			}
			return item;
		});
	}, [
		venueHistoryRawItems,
		historyVenueUmbrellaResolveQuery.data,
		venueHistoryResolveQueries,
		umbrellaLookupByConditionIdForHistory,
		umbrellaLookupByDflowMintForHistory,
		umbrellaLookupByDflowEventTickerForHistory,
		predictUmbrellaLookupForHistory,
		historyCatalogUmbrellas,
		predictMarketDetails,
	]);

	const historyResolveStage = useMemo<HistoryResolveStage>(
		() => ({
			batchFetchStatus: historyVenueUmbrellaResolveQuery.fetchStatus,
			batchIsSuccess: historyVenueUmbrellaResolveQuery.isSuccess,
			batchIsError: historyVenueUmbrellaResolveQuery.isError,
			queryCount: venueHistoryResolveQueries.length,
			rowCountTotal: venueHistory.length,
			rowCountWithLevelUpUmbrellaId: venueHistory.filter((p) =>
				Boolean(p.levelUpUmbrellaId?.trim()),
			).length,
		}),
		[
			historyVenueUmbrellaResolveQuery.fetchStatus,
			historyVenueUmbrellaResolveQuery.isSuccess,
			historyVenueUmbrellaResolveQuery.isError,
			venueHistoryResolveQueries.length,
			venueHistory,
		],
	);

	/** While resolve query key grows, `keepPreviousData` shows prior batch — still `isPending` without counting as “blocking” the History shell. */
	const historyUmbrellaResolveSettled =
		venueHistoryResolveQueries.length === 0 ||
		!Boolean(authenticated && effectiveAccount) ||
		historyVenueUmbrellaResolveQuery.isError ||
		!historyVenueUmbrellaResolveQuery.isPending ||
		historyVenueUmbrellaResolveQuery.isPlaceholderData;

	return {
		venueHistoryResolveQueries,
		historyCatalogUmbrellas,
		venueHistory,
		historyResolveStage,
		historyUmbrellaResolveSettled,
	};
}

/** Re-exported for parents that still log unmatched key counts. */
export {
	venueHistoryExchangeResolveKey,
	type UmbrellaExchangeResolveQuery,
};
