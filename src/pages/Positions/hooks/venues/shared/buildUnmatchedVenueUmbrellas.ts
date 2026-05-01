import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
	lookupUmbrellaByDflowEventTicker,
} from "@/trading/dflow/dflowUmbrellaLookup";
import {
	findMatchedMarketByPolyConditionId,
	parseVsTeamLabelsFromDisplayTitle,
} from "@/trading/polymarket/polyPositionSide";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import {
	type PredictUmbrellaLookup,
	resolvePredictUmbrellaForDisplay,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import type { MatchedMarket } from "@/types/odds-monitor";
import { type VenueId } from "@/types/trading/venuePosition";
import {
	shortPredictFunMarketTitleForPortfolio,
	stripUmbrellaDisplayPrefix,
} from "@/helpers/umbrellaDisplayName";
import {
	type UmbrellaPositions,
	buildSyntheticUmbrella,
	mergeMarketPositions,
} from "../../../utils/positionHelpers";
import { buildVenueMarketPosition } from "./buildVenueMarketPosition";

/**
 * Group venue positions whose `tokenId` is not present in `matchedIds` (i.e. they did not merge
 * into an existing umbrella) into synthetic umbrella blocks the Positions tab can render. Mirrors
 * the catalog-resolve order used by live positions: Predict via monitor lookup, DFlow via
 * event-ticker then outcome-mint, otherwise a synthetic umbrella derived from the venue title.
 */
export function buildUnmatchedVenueUmbrellas(
	positions: any[],
	matchedIds: Set<string>,
	venue: VenueId,
	venueName: string,
	qidPrefix: string,
	groupKeyFn: (p: any) => string,
	idPrefix: string,
	predictLookup: PredictUmbrellaLookup | null = null,
	predictMarketDetails?: Map<number, PredictMarketDetail>,
	matchedOddsMarkets: MatchedMarket[] = [],
	catalogUmbrellas: Umbrella[] = [],
): UmbrellaPositions[] {
	const unmatched = positions.filter((p) => !matchedIds.has(p.tokenId));
	const byGroup = new Map<string, any[]>();
	const dflowMintLookup =
		venue === "dflow" && catalogUmbrellas.length > 0
			? buildUmbrellaLookupByDflowOutcomeMint(catalogUmbrellas)
			: null;
	const dflowEventTickerLookup =
		venue === "dflow" && catalogUmbrellas.length > 0
			? buildUmbrellaLookupByDflowEventTicker(catalogUmbrellas)
			: null;
	for (const p of unmatched) {
		const key = groupKeyFn(p);
		const arr = byGroup.get(key) ?? [];
		arr.push(p);
		byGroup.set(key, arr);
	}

	const umbrellas: UmbrellaPositions[] = [];
	for (const [eventKey, group] of byGroup) {
		const first = group[0];
		let resolvedPredict: Umbrella | null = null;
		let resolvedDflowCatalog: Umbrella | null = null;
		if (venue === "predictfun") {
			const fd =
				first.numericMarketId != null && predictMarketDetails
					? predictMarketDetails.get(first.numericMarketId)
					: undefined;
			const hint = (fd?.question ?? fd?.title ?? "").trim() || undefined;
			resolvedPredict = resolvePredictUmbrellaForDisplay(
				first,
				predictLookup,
				catalogUmbrellas,
				hint,
			);
		}
		/* DFlow: event-ticker catalog match, then mint — must mirror `matchVenuePositionToUmbrella` (live Positions). */
		if (venue === "dflow") {
			const et =
				typeof first.dflowEventTicker === "string" ? first.dflowEventTicker.trim() : "";
			if (et) {
				resolvedDflowCatalog =
					lookupUmbrellaByDflowEventTicker(et, dflowEventTickerLookup, catalogUmbrellas) ??
					null;
			}
			if (!resolvedDflowCatalog && dflowMintLookup) {
				const mint = typeof first.tokenId === "string" ? first.tokenId.trim() : "";
				if (mint) resolvedDflowCatalog = dflowMintLookup.get(mint) ?? null;
			}
		}
		const predictSyntheticTitle =
			venue === "predictfun"
				? resolvedPredict?.displayName?.trim() ||
					shortPredictFunMarketTitleForPortfolio(first.marketTitle) ||
					first.marketTitle
				: first.marketTitle;
		const syntheticBlockTitle =
			venue === "predictfun"
				? predictSyntheticTitle
				: venue === "dflow"
					? stripUmbrellaDisplayPrefix(
							resolvedDflowCatalog?.displayName ?? "",
						).trim() ||
						first.marketTitle
					: first.marketTitle;
		const umbrellaForBlock =
			resolvedPredict ??
			resolvedDflowCatalog ??
			buildSyntheticUmbrella(
				`${idPrefix}-${eventKey.slice(0, 20)}`,
				syntheticBlockTitle,
				first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
			);
		const displayOverride =
			resolvedPredict?.displayName?.trim() ||
			resolvedDflowCatalog?.displayName?.trim() ||
			undefined;
		const rawMarkets = group.map((p) => {
			const polyRow =
				venue === "polymarket"
					? findMatchedMarketByPolyConditionId(matchedOddsMarkets, p.conditionId)
					: null;
			const polyLabels =
				venue === "polymarket"
					? parseVsTeamLabelsFromDisplayTitle(displayOverride) ??
						parseVsTeamLabelsFromDisplayTitle(p.marketTitle)
					: null;
			const polyInference =
				polyRow && polyLabels
					? {
							matched: polyRow,
							yesTeamLabel: polyLabels.yesTeamLabel,
							noTeamLabel: polyLabels.noTeamLabel,
						}
					: null;
			return buildVenueMarketPosition(
				p,
				venue,
				venueName,
				qidPrefix,
				undefined,
				displayOverride,
				venue === "predictfun" && predictMarketDetails && p.numericMarketId != null
					? predictMarketDetails.get(p.numericMarketId) ?? null
					: null,
				polyInference,
			);
		});
		umbrellas.push({ umbrella: umbrellaForBlock, markets: mergeMarketPositions(rawMarkets) });
	}
	return umbrellas;
}
