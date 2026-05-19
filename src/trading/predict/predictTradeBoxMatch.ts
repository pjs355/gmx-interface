import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import { normalizePredictTokenId } from "@/trading/predict/predictOrdersApi";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";

export type PredictFunWire = {
	marketIdA?: string;
	marketIdB?: string;
	tokenIdA?: string;
	tokenIdB?: string;
};

function predictMarketKeyFromWire(id: string | undefined | null): string | null {
	if (id === undefined || id === null) return null;
	const s = String(id).trim();
	if (!s) return null;
	const n = Number(s);
	if (Number.isFinite(n)) return String(Math.trunc(n));
	return s;
}

/** True when the position's Predict token or market id matches a monitor/catalog `predictFun` wire. */
export function predictPositionHitsPredictFunWire(
	pos: Pick<VenuePosition, "tokenId" | "numericMarketId">,
	pf: PredictFunWire | null | undefined,
): boolean {
	if (!pf) return false;
	const tid = normalizePredictTokenId(pos.tokenId ?? "");
	const tidA = pf.tokenIdA != null ? normalizePredictTokenId(pf.tokenIdA) : "";
	const tidB = pf.tokenIdB != null ? normalizePredictTokenId(pf.tokenIdB) : "";
	if (tid && ((tidA && tid === tidA) || (tidB && tid === tidB))) return true;
	if (pos.numericMarketId != null && Number.isFinite(pos.numericMarketId)) {
		const k = String(Math.trunc(pos.numericMarketId));
		const mkA = predictMarketKeyFromWire(pf.marketIdA);
		const mkB = predictMarketKeyFromWire(pf.marketIdB);
		if (mkA && mkA === k) return true;
		if (mkB && mkB === k) return true;
	}
	return false;
}

/** Monitor rows (and optional catalog wire) for one umbrella's Predict wiring. */
export function collectPredictFunWiresForUmbrella(
	matchedMarkets: MatchedMarket[] | null | undefined,
	umbrellaId: string | undefined,
	pageMatchedMonitor: MatchedMarket | null | undefined,
	catalogPredictFun?: PredictFunWire | null,
): PredictFunWire[] {
	const wires: PredictFunWire[] = [];
	const uid = umbrellaId?.trim();
	if (pageMatchedMonitor?.predictFun) {
		const rowUid = pageMatchedMonitor.umbrellaId?.trim();
		if (!uid || !rowUid || rowUid === uid) {
			wires.push(pageMatchedMonitor.predictFun);
		}
	}
	for (const row of matchedMarkets ?? []) {
		if (!row.predictFun) continue;
		if (uid) {
			const rowUid = row.umbrellaId?.trim();
			if (rowUid && rowUid !== uid) continue;
		}
		wires.push(row.predictFun);
	}
	if (catalogPredictFun) wires.push(catalogPredictFun);
	return wires;
}

/**
 * Trade-box gate: Predict position must match the page umbrella's Predict market/token wiring.
 * Returns false when no Predict wire exists (do not count unattributed Predict rows).
 */
export function predictVenuePositionMatchesPagePredictWiring(
	pos: VenuePosition,
	matchedMarkets: MatchedMarket[] | null | undefined,
	umbrellaId: string | undefined,
	pageMatchedMonitor: MatchedMarket | null | undefined,
	catalogPredictFun?: PredictFunWire | null,
): boolean {
	if (pos.venue !== "predictfun") return false;
	const wires = collectPredictFunWiresForUmbrella(
		matchedMarkets,
		umbrellaId,
		pageMatchedMonitor,
		catalogPredictFun,
	);
	if (wires.length === 0) return false;
	return wires.some((w) => predictPositionHitsPredictFunWire(pos, w));
}

/** Exclude resolved markets where the held outcome lost (portfolio history contract). */
export function isPredictPositionResolvedLost(
	pos: Pick<VenuePosition, "tokenId">,
	detail: PredictMarketDetail | undefined,
): boolean {
	if (!detail || detail.status !== "RESOLVED") return false;
	const tid = normalizePredictTokenId(pos.tokenId ?? "");
	if (!tid) return false;
	const outcome = detail.outcomes?.find(
		(o) => normalizePredictTokenId(o.onChainId) === tid,
	);
	return outcome?.status === "LOST";
}
