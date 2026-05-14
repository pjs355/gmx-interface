import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	dflowWireMatchesEventTicker,
	mintMatchesDflowExchange,
	normalizeDflowEventTickerKey,
} from "@/trading/dflow/dflowUmbrellaLookup";
import { limitlessPositionHitsCatalogLeg } from "@/trading/limitless/limitlessCatalogTokenPair";
import { polymarketConditionLookupKey } from "@/trading/polymarket/polymarketConditionLookup";
import { normalizePredictTokenId } from "@/trading/predict/predictOrdersApi";

type Child = {
	_id?: string;
	conditionId?: string;
	marketId?: string;
	yesTokenId?: string;
	noTokenId?: string;
};

function childrenOf(u: Umbrella): Child[] {
	return (
		(u as { originalChildren?: Child[] }).originalChildren ??
		u.children ??
		[]
	) as Child[];
}

/**
 * Mongo Question `_id` values (used as LevelUp `ProcessedOrder.questionId`) tied to a
 * venue history row via umbrella `children` / `exchangeMatching`. Lets History expanded
 * trades include LevelUp CLOB fills alongside venue rows keyed by outcome `tokenId`.
 */
export function levelUpQuestionIdsForVenueHistoryRow(
	umbrellas: Umbrella[],
	pos: VenuePosition,
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const push = (id: string | undefined | null) => {
		const s = String(id ?? "").trim();
		if (!s || seen.has(s)) return;
		seen.add(s);
		out.push(s);
	};

	const levelUpQ = (u: Umbrella) =>
		(
			u.exchangeMatching as
				| { levelup?: { questionId?: string } }
				| undefined
		)?.levelup?.questionId;

	if (pos.venue === "polymarket" && pos.conditionId?.trim()) {
		const k = polymarketConditionLookupKey(pos.conditionId);
		for (const u of umbrellas) {
			const exPoly = (
				u.exchangeMatching?.polymarket as { conditionId?: string } | undefined
			)?.conditionId;
			const childHit = childrenOf(u).some((ch) => {
				const raw = ch.conditionId ?? ch.marketId;
				return raw && polymarketConditionLookupKey(String(raw)) === k;
			});
			const exHit =
				exPoly && polymarketConditionLookupKey(String(exPoly)) === k;
			if (!childHit && !exHit) continue;
			push(levelUpQ(u));
			for (const ch of childrenOf(u)) push(ch._id);
		}
		return out;
	}

	if (pos.venue === "limitless" && (pos.tokenId?.trim() || (pos.eventSlug ?? "").trim())) {
		for (const u of umbrellas) {
			const lxM = u.exchangeMatching?.limitless;
			if (!lxM?.tokenIdA?.trim() || !lxM?.tokenIdB?.trim()) continue;
			const wire = {
				tokenIdA: lxM.tokenIdA,
				tokenIdB: lxM.tokenIdB,
				orderbookSlugA: lxM.orderbookSlugA,
				orderbookSlugB: lxM.orderbookSlugB,
				groupSlug: lxM.slug,
			};
			if (!limitlessPositionHitsCatalogLeg(pos, wire)) continue;
			push(levelUpQ(u));
			for (const ch of childrenOf(u)) push(ch._id);
		}
		return out;
	}

	if (pos.venue === "predictfun" && pos.numericMarketId != null && pos.tokenId?.trim()) {
		const mid = String(Math.trunc(Number(pos.numericMarketId)));
		const tok = normalizePredictTokenId(pos.tokenId);
		for (const u of umbrellas) {
			const pf = u.exchangeMatching?.predictFun as
				| {
						marketIdA?: string;
						marketIdB?: string;
						tokenIdA?: string;
						tokenIdB?: string;
				  }
				| undefined;
			if (!pf) continue;
			const idA =
				pf.marketIdA != null && String(pf.marketIdA).trim() !== ""
					? String(Math.trunc(Number(pf.marketIdA)))
					: "";
			const idB =
				pf.marketIdB != null && String(pf.marketIdB).trim() !== ""
					? String(Math.trunc(Number(pf.marketIdB)))
					: "";
			const onMarket = idA === mid || idB === mid;
			const tA = pf.tokenIdA ? normalizePredictTokenId(pf.tokenIdA) : "";
			const tB = pf.tokenIdB ? normalizePredictTokenId(pf.tokenIdB) : "";
			const onToken = (tA && tA === tok) || (tB && tB === tok);
			const hasTok = Boolean(tA || tB);
			if (!onMarket && !onToken) continue;
			if (hasTok && !onToken) continue;
			push(levelUpQ(u));
			for (const ch of childrenOf(u)) push(ch._id);
		}
		return out;
	}

	if (pos.venue === "dflow") {
		const et = pos.dflowEventTicker?.trim();
		if (et) {
			const etNorm = normalizeDflowEventTickerKey(et);
			for (const u of umbrellas) {
				const d = u.exchangeMatching?.dflow;
				if (!dflowWireMatchesEventTicker(etNorm, d)) continue;
				push(levelUpQ(u));
				for (const ch of childrenOf(u)) push(ch._id);
			}
			return out;
		}
		const mint = pos.tokenId?.trim();
		if (!mint) return out;
		for (const u of umbrellas) {
			if (!mintMatchesDflowExchange(u.exchangeMatching?.dflow, mint)) continue;
			push(levelUpQ(u));
			for (const ch of childrenOf(u)) push(ch._id);
		}
		return out;
	}

	return out;
}
