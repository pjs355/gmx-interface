import { useMemo } from "react";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	type VenuePosition,
	isVenueMarketResolvedLike,
} from "@/types/trading/venuePosition";
import { polymarketConditionLookupKey } from "@/trading/polymarket/polymarketConditionLookup";
import {
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { PredictOrderRow } from "@/trading/predict/predictOrdersApi";
import type { PredictMatchEventRow } from "@/trading/predict/predictMatchesApi";
import type { VenueHistoryFill } from "@/types/trading/venuePosition";
import type { computePredictCostByToken } from "@/trading/predict/predictOrdersApi";
import { predictFilledOrdersToVenueHistoryRows } from "../venues/predict/predictHistoryRows";

export type UseVenueHistoryRawItemsArgs = {
	predictPositions: VenuePosition[];
	predictWinnings: VenuePosition[];
	predictHistory: VenuePosition[];
	predictFilledOrders: PredictOrderRow[];
	predictMatches: PredictMatchEventRow[];
	predictCostLookup: ReturnType<typeof computePredictCostByToken>;
	predictHistoryFillsByToken: Map<string, VenueHistoryFill[]>;
	predictMarketDetails: Map<number, PredictMarketDetail>;
	predictUmbrellaLookup: PredictUmbrellaLookup;
	polyPositions: VenuePosition[];
	polyWinnings: VenuePosition[];
	polyHistory: VenuePosition[];
	polyTrades: VenuePosition[] | undefined;
	dflowPositions: VenuePosition[];
	dflowWinnings: VenuePosition[];
	dflowHistory: VenuePosition[];
	limitlessPositions: VenuePosition[];
	limitlessWinnings: VenuePosition[];
	limitlessHistory: VenuePosition[];
	limitlessTrades: VenuePosition[] | undefined;
	umbrellas: Umbrella[];
};

export function useVenueHistoryRawItems({
	predictPositions,
	predictWinnings,
	predictHistory,
	predictFilledOrders,
	predictMatches,
	predictCostLookup,
	predictHistoryFillsByToken,
	predictMarketDetails,
	predictUmbrellaLookup,
	polyPositions,
	polyWinnings,
	polyHistory,
	polyTrades,
	dflowPositions,
	dflowWinnings,
	dflowHistory,
	limitlessPositions,
	limitlessWinnings,
	limitlessHistory,
	limitlessTrades,
	umbrellas,
}: UseVenueHistoryRawItemsArgs): VenuePosition[] {
	return useMemo(() => {
		const items: VenuePosition[] = [];
		const seen = new Set<string>();

		for (const pos of predictWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({
					...pos,
					outcomeResult: "WON",
					marketStatus: "RESOLVED",
				});
			}
		}
		for (const pos of predictHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push(pos);
			}
		}
		for (const pos of polyWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({
					...pos,
					outcomeResult: "WON",
					marketStatus: "RESOLVED",
				});
			}
		}
		for (const pos of polyHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({
					...pos,
					outcomeResult: "LOST",
					marketStatus: "RESOLVED",
				});
			}
		}

		for (const pos of limitlessWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({
					...pos,
					outcomeResult: "WON",
					marketStatus: "RESOLVED",
				});
			}
		}
		for (const pos of limitlessHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({
					...pos,
					outcomeResult: "LOST",
					marketStatus: "RESOLVED",
				});
			}
		}

		for (const pos of polyPositions) seen.add(pos.tokenId);
		for (const pos of predictPositions) seen.add(pos.tokenId);
		for (const pos of dflowPositions) seen.add(pos.tokenId);
		for (const pos of limitlessPositions) seen.add(pos.tokenId);

		const polyTradesArr = polyTrades ?? [];
		for (const trade of polyTradesArr) {
			const cid = trade.conditionId?.trim();
			const tok = trade.tokenId?.trim();
			const histKey =
				cid && tok
					? `polyhist:${polymarketConditionLookupKey(cid)}:${tok}:${String(trade.outcome ?? "")}`
					: `polyhist:token:${tok ?? "unknown"}`;
			if (seen.has(histKey)) continue;
			seen.add(histKey);
			items.push({
				...trade,
				outcomeResult:
					trade.outcomeResult ??
					(trade.pnl !== null && trade.pnl !== undefined && trade.pnl > 0
						? "WON"
						: "LOST"),
				marketStatus: "RESOLVED",
			});
		}

		const limitlessTradesArr = limitlessTrades ?? [];
		for (const trade of limitlessTradesArr) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const resolvedLike = isVenueMarketResolvedLike(trade.marketStatus);
			// Do not dedupe by `tokenId` alone: open positions already claimed that key,
			// which would hide every Limitless fill for markets you still hold.
			const histKey =
				trade.historySourceId?.trim() ||
				`lxhist:${trade.tokenId}:${trade.shares}:${trade.cost ?? ""}:${trade.marketTitle?.slice(0, 40) ?? ""}`;
			if (seen.has(histKey)) continue;
			seen.add(histKey);
			items.push({
				...trade,
				outcomeResult:
					trade.outcomeResult ??
					(trade.pnl != null && Number.isFinite(trade.pnl)
						? trade.pnl > 0
							? "WON"
							: "LOST"
						: undefined),
				marketStatus: trade.marketStatus ?? "RESOLVED",
			});
		}

		for (const pos of dflowWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({
					...pos,
					outcomeResult: "WON",
					marketStatus: "RESOLVED",
				});
			}
		}
		for (const pos of dflowHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push(pos);
			}
		}

		const predictFilledHistory = predictFilledOrdersToVenueHistoryRows(
			predictFilledOrders,
			seen,
			predictCostLookup,
			predictMarketDetails,
			predictUmbrellaLookup,
			umbrellas,
			predictHistoryFillsByToken,
			predictMatches,
		);
		for (const p of predictFilledHistory) {
			seen.add(p.tokenId);
			items.push(p);
		}

		return items;
	}, [
		predictWinnings,
		predictHistory,
		polyWinnings,
		polyHistory,
		polyTrades,
		limitlessTrades,
		dflowWinnings,
		dflowHistory,
		polyPositions,
		predictPositions,
		dflowPositions,
		limitlessPositions,
		limitlessWinnings,
		limitlessHistory,
		predictFilledOrders,
		predictCostLookup,
		predictMarketDetails,
		predictUmbrellaLookup,
		umbrellas,
		predictHistoryFillsByToken,
		predictMatches,
	]);
}
