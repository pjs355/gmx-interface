import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type ProcessedOrder } from "@/services/api/simplifiedOrderService";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import { inferPredictSideFromMarketDetail } from "@/trading/predict/predictPositionSide";
import {
	inferLimitlessCatalogYesColumn,
	inferLimitlessYesColumnFromOutcomeTitle,
	type LimitlessInferenceWire,
} from "@/trading/limitless/limitlessCatalogTokenPair";
import { inferPolymarketYesNoFromToken } from "@/trading/polymarket/polyPositionSide";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	type VenueId,
	type VenuePosition,
} from "@/types/trading/venuePosition";
import {
	type MarketPosition,
	buildSyntheticOrder,
	venueHistoryPositionToSyntheticOrders,
} from "../../../utils/positionHelpers";

/**
 * Convert a venue-level position (`VenuePosition`-shaped row) into the umbrella-catalog
 * `MarketPosition` shape used by `PositionsTableView` / `PositionsCardView`. Handles:
 * - Side inference (Polymarket via `inferPolymarketYesNoFromToken`, Predict via market details,
 *   Limitless via merged catalog wire (`tokenIdA`/`B` + `orderbookSlugA`/`B`): dual neg-risk CLOB legs
 *   share one umbrella but wrong `tokenIdB` in Mongo is common — slug match still maps the sibling leg.
 * - Synthetic order rows from history fills, or a fallback synthetic order from `avgPrice` / `cost`.
 * - Optional price/value overrides used by the umbrella merge when an authoritative price exists.
 */
export function buildVenueMarketPosition(
	pv: any,
	venue: VenueId,
	venueName: string,
	qidPrefix: string,
	overrides?: {
		yesPrice?: number | null;
		noPrice?: number | null;
		yesValue?: number;
		noValue?: number;
	},
	marketDisplayName?: string,
	predictMarketDetail?: PredictMarketDetail | null,
	polyTeamInference?: {
		matched: MatchedMarket;
		yesTeamLabel: string;
		noTeamLabel: string;
	} | null,
	/** Merged monitor + umbrella limitless wire (tokens + per-leg slugs). */
	limitlessCatalogWire?: LimitlessInferenceWire | null,
): MarketPosition {
	const predictInferred =
		venue === "predictfun"
			? inferPredictSideFromMarketDetail(
					predictMarketDetail ?? undefined,
					pv.tokenId,
				)
			: null;
	const polyInferredSide =
		venue === "polymarket" && polyTeamInference
			? inferPolymarketYesNoFromToken(
					pv,
					polyTeamInference.matched,
					polyTeamInference.yesTeamLabel,
					polyTeamInference.noTeamLabel,
				)
			: null;
	const limitlessCatalogSide =
		venue === "limitless" && limitlessCatalogWire
			? inferLimitlessCatalogYesColumn(
					pv.tokenId,
					pv.eventSlug,
					limitlessCatalogWire,
				)
			: null;
	const isYes = polyInferredSide
		? polyInferredSide.side === "Yes"
		: predictInferred
			? predictInferred.side === "Yes"
			: limitlessCatalogSide !== null
				? limitlessCatalogSide
				: inferLimitlessYesColumnFromOutcomeTitle(pv.outcome, pv.marketTitle);
	const legKey =
		typeof pv.conditionId === "string" && pv.conditionId.trim().length > 0
			? pv.conditionId.trim().toLowerCase().replace(/^0x/i, "").slice(0, 16)
			: String(pv.tokenId ?? "")
					.replace(/^0x/i, "")
					.slice(0, 16);
	const qid = `${qidPrefix}-${legKey}`;
	const side: "Yes" | "No" = isYes ? "Yes" : "No";
	const historyFills = (pv as VenuePosition).historyFills;
	const synthOrder: ProcessedOrder[] =
		historyFills && historyFills.length > 0
			? venueHistoryPositionToSyntheticOrders(pv as VenuePosition)
			: pv.shares > 0 && (pv.avgPrice || pv.cost)
			? [
					buildSyntheticOrder(
						qid,
						venueName,
						side,
						pv.shares,
						pv.avgPrice,
						pv.cost,
						pv.historyTradeAt,
						venue === "dflow"
							? (pv as VenuePosition).dflowTradeSideLabel
							: undefined,
					),
				]
			: [];

	const yesPrice = overrides?.yesPrice !== undefined
		? (isYes ? overrides.yesPrice : null)
		: (isYes ? pv.currentPrice : null);
	const noPrice = overrides?.noPrice !== undefined
		? (isYes ? null : overrides.noPrice)
		: (isYes ? null : pv.currentPrice);
	const yesValue = overrides?.yesValue !== undefined
		? overrides.yesValue
		: (isYes ? pv.currentValue : 0);
	const noValue = overrides?.noValue !== undefined
		? overrides.noValue
		: (isYes ? 0 : pv.currentValue);

	return {
		market: {
			_id: qid,
			displayName: marketDisplayName?.trim() || pv.marketTitle,
			questionId: pv.conditionId ?? pv.tokenId,
		} as unknown as PredictionMarket,
		yesBalance: isYes ? pv.shares : 0,
		noBalance: isYes ? 0 : pv.shares,
		yesPrice,
		noPrice,
		yesValue,
		noValue,
		totalValue: (yesValue ?? 0) + (noValue ?? 0),
		orders: synthOrder,
		aggregates: {
			Yes: {
				totalSize: isYes ? pv.shares : 0,
				totalValue: isYes ? (pv.cost ?? 0) : 0,
				avgPrice: isYes ? pv.avgPrice : null,
				count: 0,
			},
			No: {
				totalSize: isYes ? 0 : pv.shares,
				totalValue: isYes ? 0 : (pv.cost ?? 0),
				avgPrice: isYes ? null : pv.avgPrice,
				count: 0,
			},
		},
		venue,
		predictOutcomeLabelYes:
			venue === "predictfun" && isYes
				? (predictInferred?.teamName ?? pv.outcome)
				: undefined,
		predictOutcomeLabelNo:
			venue === "predictfun" && !isYes
				? (predictInferred?.teamName ?? pv.outcome)
				: undefined,
	};
}
