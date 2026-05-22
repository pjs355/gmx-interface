import {
	getFinalAmount,
	normalizeOrderQuestionIdKey,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	stripUmbrellaDisplayPrefix,
	titlesMatchVenue,
	umbrellaHeaderLabel,
} from "@/helpers/umbrellaDisplayName";
import {
	matchVenuePositionToUmbrellaForHistory,
	type PredictUmbrellaLookup,
} from "@/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor";
import { venueHistorySyntheticUmbrellaId } from "./positionHelpers";
import { sortUnifiedHistoryBlocksByLatest } from "./historyActivitySort";

export type HistoryUnifiedBlock = {
	id: string;
	umbrella: Umbrella;
	luMarkets: Array<{ market: any; yes: string; no: string }>;
	venuePositions: VenuePosition[];
};

/** All id-shaped keys on a catalog market (REST `/orders` often uses `questionId` ≠ child `_id`). */
function marketCandidateIds(market: unknown): string[] {
	if (!market || typeof market !== "object") return [];
	const m = market as Record<string, unknown>;
	const raw = [m._id, m.questionId, m.marketId] as unknown[];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const r of raw) {
		if (r == null) continue;
		const s = String(r).trim().toLowerCase();
		if (!s || seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

/**
 * LevelUp REST fills keyed by Mongo `questionId`. Prefer the full umbrella
 * catalog from `getAllQuestionsForUmbrella` (active + resolved), then merge
 * any extra rows from `resolvedMarketsByUmbrella` so resolved-only payloads
 * still match when the catalog slice is incomplete.
 */
function collectLuMarketsForUmbrella(
	umbrellaId: string,
	getAllQuestionsForUmbrella: (id: string) => any[],
	resolvedFallback: any[] | undefined,
	orders: any[],
): Array<{ market: any; yes: string; no: string }> {
	const seen = new Set<string>();
	const out: Array<{ market: any; yes: string; no: string }> = [];

	const orderQuestionKeys = new Set(
		orders
			.map((o: any) => normalizeOrderQuestionIdKey(String(o?.questionId ?? "")))
			.filter(Boolean),
	);

	const pushIfHasOrders = (market: any) => {
		const candidates = marketCandidateIds(market);
		if (candidates.length === 0) return;
		const hitKey = candidates.find((k) => orderQuestionKeys.has(k));
		if (hitKey == null) return;
		const dedupeKey = market?._id
			? String(market._id).trim().toLowerCase()
			: candidates[0];
		if (seen.has(dedupeKey)) return;
		seen.add(dedupeKey);
		const rawQ =
			(market as { questionId?: unknown }).questionId ??
			(market as { _id?: unknown })._id ??
			(market as { marketId?: unknown }).marketId ??
			hitKey;
		const fa = getFinalAmount(
			orders as ProcessedOrder[],
			String(rawQ).trim(),
		);
		out.push({ market, yes: fa.yesShares.toString(), no: fa.noShares.toString() });
	};

	const allQ = getAllQuestionsForUmbrella(umbrellaId);
	if (Array.isArray(allQ) && allQ.length > 0) {
		for (const m of allQ) pushIfHasOrders(m);
	}
	if (Array.isArray(resolvedFallback) && resolvedFallback.length > 0) {
		for (const m of resolvedFallback) pushIfHasOrders(m);
	}
	return out;
}

function blockLuMarketsCoverQuestionNorm(
	block: HistoryUnifiedBlock,
	qidNorm: string,
): boolean {
	for (const row of block.luMarkets) {
		if (marketCandidateIds(row.market).some((c) => c === qidNorm)) {
			return true;
		}
	}
	return false;
}

function mergeOrphanLevelUpFillsIntoBlocks(
	blocks: Map<string, HistoryUnifiedBlock>,
	umbrellas: Umbrella[],
	orders: any[],
	getAllQuestionsForUmbrella: (id: string) => any[],
	resolvedMarketsByUmbrella: Record<string, any[]>,
): void {
	const inLu = new Set<string>();
	for (const b of blocks.values()) {
		for (const { market } of b.luMarkets) {
			for (const c of marketCandidateIds(market)) {
				inLu.add(c);
			}
		}
	}

	const findMarketForQuestion = (
		qidNorm: string,
	): { umbrellaId: string; market: any } | null => {
		for (const u of umbrellas) {
			const uid = String(u._id ?? "");
			if (!uid) continue;
			const list = getAllQuestionsForUmbrella(uid);
			if (!Array.isArray(list)) continue;
			for (const m of list) {
				if (marketCandidateIds(m).some((c) => c === qidNorm)) {
					return { umbrellaId: uid, market: m };
				}
			}
		}
		for (const [uid, list] of Object.entries(resolvedMarketsByUmbrella)) {
			if (!Array.isArray(list)) continue;
			for (const m of list) {
				if (marketCandidateIds(m).some((c) => c === qidNorm)) {
					return { umbrellaId: uid, market: m };
				}
			}
		}
		return null;
	};

	const procOrders = orders as ProcessedOrder[];

	for (const o of orders) {
		if (!o?.filled || !o?.questionId) continue;
		const qn = normalizeOrderQuestionIdKey(String(o.questionId).trim());
		if (inLu.has(qn)) continue;

		const hit = findMarketForQuestion(qn);
		let umbrellaKey: string;
		let catalogMarket: any | undefined;

		if (hit) {
			umbrellaKey = hit.umbrellaId;
			catalogMarket = hit.market;
		} else {
			const rawUmbrellaId = (o as ProcessedOrder).umbrellaId;
			const fromOrder =
				typeof rawUmbrellaId === "string"
					? rawUmbrellaId.trim()
					: rawUmbrellaId != null
						? String(rawUmbrellaId).trim()
						: "";
			if (!fromOrder) continue;
			umbrellaKey = fromOrder;
			catalogMarket = undefined;
		}

		let block = blocks.get(umbrellaKey);
		if (!block) {
			const umb =
				umbrellas.find((x) => String(x._id) === umbrellaKey) ??
				({
					_id: umbrellaKey,
					displayName:
						(catalogMarket as { umbrellaName?: string } | undefined)
							?.umbrellaName || `Umbrella ${umbrellaKey.slice(0, 8)}…`,
					children: [],
					originalChildren: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					__v: 0,
				} as Umbrella);
			block = {
				id: umbrellaKey,
				umbrella: umb,
				luMarkets: [],
				venuePositions: [],
			};
			blocks.set(umbrellaKey, block);
		}

		if (blockLuMarketsCoverQuestionNorm(block, qn)) {
			inLu.add(qn);
			continue;
		}

		const fa = getFinalAmount(procOrders, String(o.questionId).trim());
		if (catalogMarket != null) {
			block.luMarkets.push({
				market: catalogMarket,
				yes: fa.yesShares.toString(),
				no: fa.noShares.toString(),
			});
		} else {
			const qidDisplay = String(o.questionId).trim();
			const header = umbrellaHeaderLabel(block.umbrella);
			block.luMarkets.push({
				market: {
					_id: qidDisplay,
					questionId: qidDisplay,
					...(header
						? { displayName: header, question: header }
						: {}),
				},
				yes: fa.yesShares.toString(),
				no: fa.noShares.toString(),
			});
		}
		inLu.add(qn);
	}
}

export type BuildHistoryUnifiedBlocksParams = {
	umbrellas: Umbrella[];
	getAllQuestionsForUmbrella: (id: string) => any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
	orders: any[];
	venueHistory: VenuePosition[];
	umbrellaLookupByConditionId: Map<string, Umbrella>;
	predictUmbrellaLookup: PredictUmbrellaLookup;
	umbrellaLookupByDflowOutcomeMint: Map<string, Umbrella>;
	umbrellaLookupByDflowEventTicker: Map<string, Umbrella>;
};

export function buildHistoryUnifiedBlocks({
	umbrellas,
	getAllQuestionsForUmbrella,
	resolvedMarketsByUmbrella,
	orders,
	venueHistory,
	umbrellaLookupByConditionId,
	predictUmbrellaLookup,
	umbrellaLookupByDflowOutcomeMint,
	umbrellaLookupByDflowEventTicker,
}: BuildHistoryUnifiedBlocksParams): HistoryUnifiedBlock[] {
	const blocks = new Map<string, HistoryUnifiedBlock>();

	const umbrellaIds = new Set<string>();
	for (const u of umbrellas) {
		if (u?._id) umbrellaIds.add(String(u._id));
	}
	for (const k of Object.keys(resolvedMarketsByUmbrella)) {
		if (k) umbrellaIds.add(k);
	}

	for (const umbrellaId of umbrellaIds) {
		const luMarkets = collectLuMarketsForUmbrella(
			umbrellaId,
			getAllQuestionsForUmbrella,
			resolvedMarketsByUmbrella[umbrellaId],
			orders,
		);
		if (luMarkets.length === 0) continue;

		let umb = umbrellas.find((u) => u._id === umbrellaId);
		if (!umb) {
			const resolvedList = resolvedMarketsByUmbrella[umbrellaId];
			umb = {
				_id: umbrellaId,
				displayName:
					resolvedList?.[0]?.umbrellaName ||
					`Umbrella ${umbrellaId.slice(0, 8)}…`,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
			} as Umbrella;
		}
		blocks.set(umbrellaId, {
			id: umbrellaId,
			umbrella: umb,
			luMarkets,
			venuePositions: [],
		});
	}

	const placed = new WeakSet<VenuePosition>();

	for (const pos of venueHistory) {
		const uid = pos.levelUpUmbrellaId?.trim();
		if (!uid) continue;
		const fromCatalog = umbrellas.find((u) => u._id === uid);
		const dn =
			stripUmbrellaDisplayPrefix(
				pos.levelUpUmbrellaDisplayName ?? pos.marketTitle,
			).trim() || pos.marketTitle;
		const rowUmbrella: Umbrella =
			fromCatalog ??
			({
				_id: uid,
				displayName: dn || `Umbrella ${uid.slice(0, 8)}…`,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
				_polyIcon: pos.iconUrl,
			} as Umbrella);
		const existing = blocks.get(uid);
		if (!existing) {
			blocks.set(uid, {
				id: uid,
				umbrella: rowUmbrella,
				luMarkets: [],
				venuePositions: [pos],
			});
		} else {
			const cur = existing.umbrella as Umbrella;
			const prefer =
				(Array.isArray(rowUmbrella.children) && rowUmbrella.children.length > 0) ||
				(rowUmbrella as { exchangeMatching?: unknown }).exchangeMatching != null
					? rowUmbrella
					: cur;
			if (prefer !== cur) {
				existing.umbrella = prefer;
			}
			existing.venuePositions.push(pos);
		}
		placed.add(pos);
	}

	for (const pos of venueHistory) {
		if (placed.has(pos)) continue;
		const predictHint =
			pos.venue === "predictfun"
				? stripUmbrellaDisplayPrefix(pos.marketTitle) || undefined
				: undefined;
		const matchedUmb = matchVenuePositionToUmbrellaForHistory(
			pos,
			pos.venue,
			umbrellaLookupByConditionId,
			umbrellas,
			predictUmbrellaLookup,
			predictHint,
			umbrellaLookupByDflowOutcomeMint,
			umbrellaLookupByDflowEventTicker,
		);
		if (matchedUmb) {
			const id = matchedUmb._id;
			if (!blocks.has(id)) {
				blocks.set(id, {
					id,
					umbrella: matchedUmb,
					luMarkets: [],
					venuePositions: [],
				});
			}
			blocks.get(id)!.venuePositions.push(pos);
			placed.add(pos);
		}
	}

	const unmatchedByTitle = new Map<string, VenuePosition[]>();
	for (const pos of venueHistory) {
		if (placed.has(pos)) continue;
		const key = stripUmbrellaDisplayPrefix(pos.marketTitle) || pos.marketTitle;
		const arr = unmatchedByTitle.get(key) ?? [];
		arr.push(pos);
		unmatchedByTitle.set(key, arr);
	}
	for (const [title, positions] of unmatchedByTitle) {
		const matched = umbrellas.find(
			(u) => u.displayName && titlesMatchVenue(u.displayName, title),
		);
		const p0 = positions[0];
		const synth =
			matched ??
			({
				_id: venueHistorySyntheticUmbrellaId(title, positions),
				displayName: title,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
				_polyIcon: p0?.iconUrl,
			} as Umbrella);
		blocks.set(synth._id, {
			id: synth._id,
			umbrella: synth,
			luMarkets: [],
			venuePositions: positions,
		});
	}

	mergeOrphanLevelUpFillsIntoBlocks(
		blocks,
		umbrellas,
		orders,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	);

	return sortUnifiedHistoryBlocksByLatest(Array.from(blocks.values()), orders);
}
