import { titlesMatchVenue } from "@/helpers/umbrellaDisplayName";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenueId, VenuePosition } from "@/types/trading/venuePosition";
import {
	lookupUmbrellaByDflowEventTicker,
	mintMatchesDflowExchange,
} from "@/trading/dflow/dflowUmbrellaLookup";
import { canonicalLimitlessTokenId } from "@/trading/limitless/limitlessTokenId";
import { polymarketConditionLookupKey } from "@/trading/polymarket/polymarketConditionLookup";
import { normalizePredictTokenId } from "@/trading/predict/predictOrdersApi";

/** Set `VITE_DEBUG_PREDICT_UMBRELLA=1` to enable (default dev builds stay quiet). */
export const predictUmbrellaDebugEnabled =
	import.meta.env.VITE_DEBUG_PREDICT_UMBRELLA === "1";

/** Namespaced portfolio / resolver debug (dev or `VITE_DEBUG_PREDICT_UMBRELLA=1`). */
export function logPredictUmbrella(phase: string, payload: Record<string, unknown>) {
	if (!predictUmbrellaDebugEnabled) return;
	// eslint-disable-next-line no-console -- intentional debug aid
	console.info(`[predict-umbrella:${phase}]`, payload);
}

const debugOnceKeys = new Set<string>();
const DEBUG_ONCE_CAP = 96;

/** Same as {@link logPredictUmbrella} but at most once per `phase` + `dedupeId` (avoids render-loop spam). */
export function logPredictUmbrellaOnce(phase: string, dedupeId: string, payload: Record<string, unknown>) {
	if (!predictUmbrellaDebugEnabled) return;
	const k = `${phase}:${dedupeId}`;
	if (debugOnceKeys.size >= DEBUG_ONCE_CAP && !debugOnceKeys.has(k)) return;
	if (debugOnceKeys.has(k)) return;
	debugOnceKeys.add(k);
	// eslint-disable-next-line no-console -- intentional debug aid
	console.info(`[predict-umbrella:${phase}]`, payload);
}

export type PredictUmbrellaLookup = {
	byToken: Map<string, Umbrella>;
	byMarketId: Map<string, Umbrella>;
};

/** For debug: nearest keys in `byMarketId` when Predict `numericMarketId` is missing (wrong/stale id wiring). */
function closestMarketIdLookupDiagnostics(
	lookup: PredictUmbrellaLookup,
	targetMid: number | null | undefined,
	limit = 6,
): Array<{
	marketId: string;
	delta: number;
	umbrellaId?: string;
	umbrellaDisplaySample?: string;
}> {
	if (targetMid == null || !Number.isFinite(targetMid)) return [];
	const t = Math.trunc(targetMid);
	const scored: Array<{ marketId: string; delta: number; umb: Umbrella | undefined }> = [];
	for (const id of lookup.byMarketId.keys()) {
		const n = Number(id);
		if (!Number.isFinite(n)) continue;
		scored.push({
			marketId: id,
			delta: Math.abs(n - t),
			umb: lookup.byMarketId.get(id),
		});
	}
	scored.sort((a, b) => a.delta - b.delta || Number(a.marketId) - Number(b.marketId));
	return scored.slice(0, limit).map(({ marketId, delta, umb }) => ({
		marketId,
		delta,
		umbrellaId: umb?._id,
		umbrellaDisplaySample: umb?.displayName?.slice(0, 72),
	}));
}

function lookupMarketIdKeysSortedSample(lookup: PredictUmbrellaLookup, max: number): string[] {
	return [...lookup.byMarketId.keys()]
		.sort((a, b) => {
			const na = Number(a);
			const nb = Number(b);
			if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
			return a.localeCompare(b);
		})
		.slice(0, max);
}

function predictMarketKeyFromWire(id: string | undefined | null): string | null {
	if (id === undefined || id === null) return null;
	const s = String(id).trim();
	if (!s) return null;
	const n = Number(s);
	if (Number.isFinite(n)) return String(Math.trunc(n));
	return s;
}

type PredictFunWire = {
	marketIdA?: string;
	marketIdB?: string;
	tokenIdA?: string;
	tokenIdB?: string;
};

/**
 * Indexes Predict outcome token ids and numeric market ids for {@link resolveUmbrellaForPredictPosition}.
 * Call for each `predictFun` blob (odds-monitor row or `umbrella.exchangeMatching`).
 */
function mergePredictFunWireIntoLookup(
	pf: PredictFunWire | null | undefined,
	umb: Umbrella,
	byToken: Map<string, Umbrella>,
	byMarketId: Map<string, Umbrella>,
): void {
	if (!pf) return;
	const tidA = pf.tokenIdA != null ? normalizePredictTokenId(pf.tokenIdA) : "";
	const tidB = pf.tokenIdB != null ? normalizePredictTokenId(pf.tokenIdB) : "";
	if (tidA) byToken.set(tidA, umb);
	if (tidB) byToken.set(tidB, umb);
	const mkA = predictMarketKeyFromWire(pf.marketIdA ?? undefined);
	const mkB = predictMarketKeyFromWire(pf.marketIdB ?? undefined);
	if (mkA) byMarketId.set(mkA, umb);
	if (mkB && mkB !== mkA) byMarketId.set(mkB, umb);
}

/**
 * Deterministic Predict.fun → LevelUp umbrella map:
 * 1) odds-monitor `MatchedMarket` rows (`umbrellaId` + `predictFun`),
 * 2) each loaded umbrella’s `exchangeMatching.predictFun` (fills gaps when REST omitted token ids or monitor row is thin).
 */
export function buildPredictUmbrellaLookup(
	matchedMarkets: MatchedMarket[] | null | undefined,
	umbrellas: Umbrella[] | null | undefined,
): PredictUmbrellaLookup {
	const byToken = new Map<string, Umbrella>();
	const byMarketId = new Map<string, Umbrella>();
	if (!umbrellas?.length) {
		return { byToken, byMarketId };
	}
	const idToUmb = new Map<string, Umbrella>();
	for (const u of umbrellas) {
		if (u?._id) idToUmb.set(String(u._id).trim(), u);
	}
	for (const row of matchedMarkets ?? []) {
		const uid = row.umbrellaId?.trim();
		if (!uid) continue;
		const umb = idToUmb.get(uid);
		if (!umb) continue;
		mergePredictFunWireIntoLookup(row.predictFun, umb, byToken, byMarketId);
	}
	for (const umb of umbrellas) {
		const pf = umb.exchangeMatching?.predictFun;
		if (pf) mergePredictFunWireIntoLookup(pf, umb, byToken, byMarketId);
	}
	return { byToken, byMarketId };
}

export function resolveUmbrellaForPredictPosition(
	pos: Pick<VenuePosition, "tokenId" | "numericMarketId">,
	lookup: PredictUmbrellaLookup,
): Umbrella | null {
	const tid = normalizePredictTokenId(pos.tokenId);
	if (tid && lookup.byToken.has(tid)) {
		return lookup.byToken.get(tid)!;
	}
	if (pos.numericMarketId != null && Number.isFinite(pos.numericMarketId)) {
		const k = String(Math.trunc(pos.numericMarketId));
		if (lookup.byMarketId.has(k)) return lookup.byMarketId.get(k)!;
	}
	return null;
}

/**
 * Map Predict.fun rows to a catalog umbrella: odds-monitor (`predictFun` token / market id)
 * first, then the same {@link titlesMatchVenue} umbrella matching used for Polymarket / DFlow
 * when the monitor row is missing or incomplete.
 */
export function resolvePredictUmbrellaForDisplay(
	pos: Pick<VenuePosition, "tokenId" | "numericMarketId" | "marketTitle">,
	lookup: PredictUmbrellaLookup | null,
	umbrellas: Umbrella[] | null | undefined,
	/** Predict.fun `question` / `title` from market details — often longer than positions API `marketTitle`. */
	matchTitleHint?: string | null,
): Umbrella | null {
	const tid = normalizePredictTokenId(pos.tokenId);
	const marketKey =
		pos.numericMarketId != null && Number.isFinite(pos.numericMarketId)
			? String(Math.trunc(pos.numericMarketId))
			: null;

	if (lookup) {
		const fromMonitor = resolveUmbrellaForPredictPosition(pos, lookup);
		if (fromMonitor) return fromMonitor;
		logPredictUmbrellaOnce("resolve-monitor-miss", `${tid}:${marketKey ?? "na"}`, {
			tokenId: tid,
			numericMarketId: pos.numericMarketId,
			marketKey,
			lookupTokenHit: tid ? lookup.byToken.has(tid) : false,
			lookupMarketHit: marketKey ? lookup.byMarketId.has(marketKey) : false,
			lookupTokenSize: lookup.byToken.size,
			lookupMarketIdSize: lookup.byMarketId.size,
			lookupMarketIdKeysSortedSample: lookupMarketIdKeysSortedSample(lookup, 32),
			closestMarketIdsInLookup: closestMarketIdLookupDiagnostics(
				lookup,
				pos.numericMarketId,
				8,
			),
			marketTitleSample: (pos.marketTitle ?? "").slice(0, 160),
			note:
				"No lookup hit: GET /matched-markets + umbrella.exchangeMatching lack matching predictFun token/market ids for this Predict position (ids must match Predict REST). If `closestMarketIdsInLookup` shows a nearby id (e.g. 205017 vs 205021), exchangeMatching may point at the wrong Predict market.",
		});
	} else {
		logPredictUmbrellaOnce("resolve-no-lookup", `${tid}:${marketKey ?? "na"}`, {
			tokenId: tid,
			numericMarketId: pos.numericMarketId,
			marketTitleSample: (pos.marketTitle ?? "").slice(0, 160),
		});
	}

	if (!umbrellas?.length) {
		logPredictUmbrellaOnce("resolve-no-catalog", `${tid}:${marketKey ?? "na"}`, {
			tokenId: tid,
			numericMarketId: pos.numericMarketId,
		});
		return null;
	}
	const fromPos = (pos.marketTitle ?? "").trim();
	const fromHint = (matchTitleHint ?? "").trim();
	const candidates = [fromHint, fromPos].filter(Boolean);
	const seen = new Set<string>();
	const ordered = candidates
		.filter((t) => {
			if (seen.has(t)) return false;
			seen.add(t);
			return true;
		})
		.sort((a, b) => b.length - a.length);
	for (const title of ordered) {
		const hit = umbrellas.find((u) => titlesMatchVenue(u.displayName ?? "", title));
		if (hit) {
			logPredictUmbrellaOnce("resolve-title-hit", `${tid}:${marketKey ?? "na"}`, {
				tokenId: tid,
				numericMarketId: pos.numericMarketId,
				matchedUmbrellaId: hit._id,
				matchedDisplayName: hit.displayName,
				matchedAgainstTitleSample: title.slice(0, 200),
			});
			return hit;
		}
	}
	logPredictUmbrellaOnce("resolve-title-miss", `${tid}:${marketKey ?? "na"}`, {
		tokenId: tid,
		numericMarketId: pos.numericMarketId,
		titleCandidates: ordered.map((t) => t.slice(0, 200)),
		catalogUmbrellaCount: umbrellas.length,
		catalogDisplayNameSamples: umbrellas
			.slice(0, 12)
			.map((u) => (u.displayName ?? "").slice(0, 120)),
		hint:
			"Title match only searches umbrellas returned by fetchAllUmbrellas — if the event is not in that list, use shortPredictFunMarketTitleForPortfolio in the UI.",
	});
	return null;
}

function catalogStubFromBatchResolve(
	resolvedCatalogId: string,
	pos: Pick<VenuePosition, "levelUpUmbrellaDisplayName" | "marketTitle">,
): Umbrella {
	const name =
		pos.levelUpUmbrellaDisplayName?.trim() ||
		pos.marketTitle?.trim() ||
		"Resolved market";
	return {
		_id: resolvedCatalogId,
		displayName: name,
		children: [],
		originalChildren: [],
		createdAt: new Date(0).toISOString(),
		updatedAt: new Date(0).toISOString(),
		__v: 0,
	} as Umbrella;
}

export function matchVenuePositionToUmbrella(
	pos: Pick<
		VenuePosition,
		| "conditionId"
		| "marketTitle"
		| "tokenId"
		| "numericMarketId"
		| "levelUpUmbrellaId"
		| "levelUpUmbrellaDisplayName"
		| "eventSlug"
		| "dflowEventTicker"
	>,
	venue: VenueId,
	conditionLookup: Map<string, Umbrella>,
	umbrellas: Umbrella[],
	predictLookup: PredictUmbrellaLookup | null,
	predictTitleHint?: string | null,
	/** Outcome mint → catalog umbrella (`exchangeMatching.dflow`). Same index as `buildUmbrellaLookupByDflowOutcomeMint`. */
	dflowMintLookup?: Map<string, Umbrella> | null,
	/** `eventTicker` → catalog umbrella (`exchangeMatching.dflow.eventTicker`). Same index as `buildUmbrellaLookupByDflowEventTicker`. */
	dflowEventTickerLookup?: Map<string, Umbrella> | null,
): Umbrella | null {
	/** Poly map keys are Polymarket CTF ids only — do not run for Predict (may carry unrelated hex). */
	if (venue === "polymarket") {
		const cid = pos.conditionId?.trim();
		if (cid) {
			const key = polymarketConditionLookupKey(cid);
			if (key && conditionLookup.has(key)) {
				return conditionLookup.get(key)!;
			}
		}
	}
	const resolvedCatalogId = pos.levelUpUmbrellaId?.trim();
	if (resolvedCatalogId) {
		const byId = umbrellas.find((u) => String(u._id).trim() === resolvedCatalogId);
		if (byId) return byId;
		/**
		 * Batch resolve can return inactive umbrellas omitted from GET /umbrellas (active-only).
		 * For Predict, still allow monitor/catalog `resolvePredictUmbrellaForDisplay` to run.
		 */
		if (venue !== "predictfun") {
			return catalogStubFromBatchResolve(resolvedCatalogId, pos);
		}
	}
	if (venue === "predictfun") {
		const fromPredict = resolvePredictUmbrellaForDisplay(
			pos,
			predictLookup,
			umbrellas,
			predictTitleHint,
		);
		if (fromPredict) return fromPredict;
		if (resolvedCatalogId) {
			return catalogStubFromBatchResolve(resolvedCatalogId, pos);
		}
		return null;
	}
	if (venue === "limitless") {
		const slug = (pos.eventSlug ?? "").trim();
		const tid = canonicalLimitlessTokenId(String(pos.tokenId ?? ""));
		if (!tid) return null;

		const byToken: Umbrella[] = [];
		for (const u of umbrellas) {
			const lx = u.exchangeMatching?.limitless;
			if (!lx?.tokenIdA?.trim() || !lx?.tokenIdB?.trim()) continue;
			const a = canonicalLimitlessTokenId(String(lx.tokenIdA));
			const b = canonicalLimitlessTokenId(String(lx.tokenIdB));
			if (tid === a || tid === b) byToken.push(u);
		}
		if (byToken.length === 0) return null;
		if (byToken.length === 1) return byToken[0]!;

		const slugNorm = slug;
		const slugMatches = byToken.filter((u) => {
			const lx = u.exchangeMatching!.limitless!;
			const cand = [
				(lx.slug ?? "").trim(),
				(lx.orderbookSlugA ?? "").trim(),
				(lx.orderbookSlugB ?? "").trim(),
			].filter((s) => s.length > 0);
			return slugNorm.length > 0 && cand.some((c) => c === slugNorm);
		});
		if (slugMatches.length === 1) return slugMatches[0]!;
		if (slugMatches.length > 1) return slugMatches[0]!;
		return byToken[0]!;
	}
	/**
	 * DFlow live Positions (do not regress)
	 * ------------------------------
	 * Batch positions usually include **both** `dflowEventTicker` and outcome `tokenId` (mint).
	 * Catalog umbrellas may only have **mints** on `exchangeMatching.dflow` (no `eventTicker`).
	 * If we `return` after event-ticker lookup only, those rows never match an umbrella and
	 * disappear from Positions / trade box. **Always**: try event-ticker first, then mint
	 * map + `mintMatchesDflowExchange` scan. Keep the same order in `buildUnmatchedVenueUmbrellas`,
	 * `umbrellaForPosition` (trade box), and venue-history merge.
	 */
	if (venue === "dflow") {
		const et = pos.dflowEventTicker?.trim();
		if (et) {
			const byEt = lookupUmbrellaByDflowEventTicker(
				et,
				dflowEventTickerLookup,
				umbrellas,
			);
			if (byEt) return byEt;
		}
		const mint = typeof pos.tokenId === "string" ? pos.tokenId.trim() : "";
		if (!mint) return null;
		if (dflowMintLookup) {
			const byMint = dflowMintLookup.get(mint);
			if (byMint) return byMint;
		}
		for (const u of umbrellas) {
			if (mintMatchesDflowExchange(u.exchangeMatching?.dflow, mint)) return u;
		}
		return null;
	}
	return (
		umbrellas.find((u) =>
			titlesMatchVenue(u.displayName ?? "", pos.marketTitle ?? ""),
		) ?? null
	);
}

/**
 * Same as {@link matchVenuePositionToUmbrella}, but if the matcher returns null while
 * batch resolve already set `levelUpUmbrellaId`, still return a catalog stub so History
 * groups under the resolved umbrella id.
 */
export function matchVenuePositionToUmbrellaForHistory(
	pos: Pick<
		VenuePosition,
		| "conditionId"
		| "marketTitle"
		| "tokenId"
		| "numericMarketId"
		| "levelUpUmbrellaId"
		| "levelUpUmbrellaDisplayName"
		| "eventSlug"
		| "dflowEventTicker"
	>,
	venue: VenueId,
	conditionLookup: Map<string, Umbrella>,
	umbrellas: Umbrella[],
	predictLookup: PredictUmbrellaLookup | null,
	predictTitleHint?: string | null,
	dflowMintLookup?: Map<string, Umbrella> | null,
	dflowEventTickerLookup?: Map<string, Umbrella> | null,
): Umbrella | null {
	const hit = matchVenuePositionToUmbrella(
		pos,
		venue,
		conditionLookup,
		umbrellas,
		predictLookup,
		predictTitleHint,
		dflowMintLookup,
		dflowEventTickerLookup,
	);
	if (hit) return hit;
	const id = pos.levelUpUmbrellaId?.trim();
	if (!id) return null;
	return catalogStubFromBatchResolve(id, pos);
}
