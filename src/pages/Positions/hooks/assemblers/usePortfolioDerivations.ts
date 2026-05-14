import { useCallback, useMemo } from "react";
import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import { getTradingReturns } from "@/services/api/simplifiedOrderService";
import { type UmbrellaPositions } from "../../utils/positionHelpers";

type AggregatesEntry = {
	Yes: { avgPrice: number | null; cost: number };
	No: { avgPrice: number | null; cost: number };
};

type SpentEntry = { Yes: number; No: number };

type BookPreview = { lowestAsk: number | null; highestBid: number | null };

export type UsePortfolioDerivationsArgs = {
	umbrellaPositions: UmbrellaPositions[];
	resolvedUmbrellaPositions: UmbrellaPositions[];
	umbrellas: Umbrella[];
	getAllQuestionsForUmbrella: (id: string) => unknown[];
	orders: ProcessedOrder[] | null | undefined;
	allBooksPreview: Record<string, BookPreview | undefined>;
};

export type UsePortfolioDerivationsResult = {
	openPositionsValue: number;
	unclaimedWinningsPayoutTotal: number;
	positionsTotalValue: number;
	portfolioSidePriceMap: Record<
		string,
		{ yesPrice: number | null; noPrice: number | null }
	>;
	getCurrentPriceForSide: (
		market: PredictionMarket,
		side: "Yes" | "No",
	) => number | null;
	umbrellaBalancesPositions: Array<{
		umbrella: UmbrellaPositions["umbrella"];
		markets: Array<{
			market: PredictionMarket;
			yes: string;
			no: string;
			venue: string;
			includesDflowVenue?: boolean;
			includesLimitlessVenue?: boolean;
			predictOutcomeLabelYes?: string;
			predictOutcomeLabelNo?: string;
		}>;
	}>;
	umbrellaBalancesOrders: Array<{
		umbrella: UmbrellaPositions["umbrella"];
		markets: Array<{ market: PredictionMarket; yes: string; no: string }>;
	}>;
	combinedOrders: ProcessedOrder[];
	returnsByQid: Record<string, { Yes: number; No: number }>;
	aggregates: Record<string, AggregatesEntry>;
	spentByQid: Record<string, SpentEntry>;
};

export function usePortfolioDerivations({
	umbrellaPositions,
	resolvedUmbrellaPositions,
	umbrellas,
	getAllQuestionsForUmbrella,
	orders,
	allBooksPreview,
}: UsePortfolioDerivationsArgs): UsePortfolioDerivationsResult {
	const allUmbrellas = useMemo(
		() =>
			umbrellas.map((umb) => ({
				umbrella: umb,
				markets:
					(getAllQuestionsForUmbrella(umb._id) as PredictionMarket[]) || [],
			})),
		[umbrellas, getAllQuestionsForUmbrella],
	);

	const openPositionsValue = useMemo(() => {
		return umbrellaPositions.reduce(
			(total, u) => total + u.markets.reduce((s, m) => s + m.totalValue, 0),
			0,
		);
	}, [umbrellaPositions]);

	const unclaimedWinningsPayoutTotal = useMemo(() => {
		if (!resolvedUmbrellaPositions.length) return 0;
		return resolvedUmbrellaPositions.reduce((t, u) => {
			return (
				t +
				u.markets.reduce((s, mp) => {
					const o = String(
						(mp.market as { resolvedOutcome?: string }).resolvedOutcome || "",
					).toLowerCase();
					if (o === "yes" && Number(mp.yesBalance) > 0) {
						return s + Number(mp.yesBalance);
					}
					if (o === "no" && Number(mp.noBalance) > 0) {
						return s + Number(mp.noBalance);
					}
					return s;
				}, 0)
			);
		}, 0);
	}, [resolvedUmbrellaPositions]);

	const positionsTotalValue = useMemo(
		() => openPositionsValue + unclaimedWinningsPayoutTotal,
		[openPositionsValue, unclaimedWinningsPayoutTotal],
	);

	// Includes merged LevelUp + venue rows (`mergeMarketPositions` clears `venue`), so Polymarket
	// marks are not dropped when the primary `market._id` is the LevelUp question.
	const portfolioSidePriceMap = useMemo(() => {
		const map: Record<
			string,
			{ yesPrice: number | null; noPrice: number | null }
		> = {};
		for (const up of umbrellaPositions) {
			for (const mp of up.markets) {
				const id = mp.market._id;
				if (!id) continue;
				map[id] = { yesPrice: mp.yesPrice, noPrice: mp.noPrice };
			}
		}
		return map;
	}, [umbrellaPositions]);

	const getCurrentPriceForSide = useCallback(
		(market: PredictionMarket, side: "Yes" | "No"): number | null => {
			const stored = portfolioSidePriceMap[market._id];
			const fromStored =
				stored != null
					? side === "Yes"
						? stored.yesPrice
						: stored.noPrice
					: null;
			if (fromStored != null && Number.isFinite(fromStored)) return fromStored;

			const questionId = market.questionId || market._id;
			if (!questionId) return null;
			const preview = allBooksPreview[questionId];
			if (side === "Yes") return preview?.lowestAsk ?? null;
			return preview?.highestBid !== null && preview?.highestBid !== undefined
				? 1 - preview.highestBid
				: null;
		},
		[portfolioSidePriceMap, allBooksPreview],
	);

	const umbrellaBalancesPositions = useMemo(
		() =>
			umbrellaPositions.map((up) => ({
				umbrella: up.umbrella,
				markets: up.markets.map((mp) => ({
					market: mp.market,
					yes: mp.yesBalance.toString(),
					no: mp.noBalance.toString(),
					venue: mp.venue ?? "levelup",
					...(mp.includesDflowVenue ? { includesDflowVenue: true as const } : {}),
					...(mp.includesLimitlessVenue ? { includesLimitlessVenue: true as const } : {}),
					predictOutcomeLabelYes: mp.predictOutcomeLabelYes,
					predictOutcomeLabelNo: mp.predictOutcomeLabelNo,
				})),
			})),
		[umbrellaPositions],
	);

	const combinedOrders = useMemo(() => {
		const synth: ProcessedOrder[] = [];
		for (const up of umbrellaPositions) {
			for (const mp of up.markets) {
				const qid =
					mp.market._id ||
					mp.market.questionId ||
					(mp.market as { marketId?: string }).marketId;
				for (const order of mp.orders) {
					if (order.venue && order.venue !== "LevelUp") {
						synth.push({ ...order, questionId: qid });
					}
				}
			}
		}
		return [
			...(orders || []).map((o) => (o.venue ? o : { ...o, venue: "LevelUp" })),
			...synth,
		];
	}, [orders, umbrellaPositions]);

	const umbrellaBalancesOrders = useMemo(
		() =>
			allUmbrellas.map(({ umbrella, markets }) => ({
				umbrella,
				markets: markets.map((market) => ({ market, yes: "0", no: "0" })),
			})),
		[allUmbrellas],
	);

	const returnsByQid = useMemo(() => {
		const map: Record<string, { Yes: number; No: number }> = {};
		umbrellaPositions.forEach((up) => {
			up.markets.forEach((mp) => {
				const balanceId = mp.market._id;
				if (balanceId) {
					try {
						const returns = getTradingReturns(orders || [], balanceId);
						map[balanceId] = { Yes: returns.yesPnL, No: returns.noPnL };
					} catch {
						/* ignore */
					}
				}
			});
		});
		return map;
	}, [umbrellaPositions, orders]);

	const aggregates = useMemo(() => {
		return umbrellaPositions.reduce(
			(acc, up) => {
				up.markets.forEach((mp) => {
					const balanceId = mp.market._id;
					if (balanceId) {
						acc[balanceId] = {
							Yes: {
								avgPrice: mp.aggregates.Yes.avgPrice,
								cost: mp.aggregates.Yes.totalValue,
							},
							No: {
								avgPrice: mp.aggregates.No.avgPrice,
								cost: mp.aggregates.No.totalValue,
							},
						};
					}
				});
				return acc;
			},
			{} as Record<string, AggregatesEntry>,
		);
	}, [umbrellaPositions]);

	const spentByQid = useMemo(() => {
		return umbrellaPositions.reduce(
			(acc, up) => {
				up.markets.forEach((mp) => {
					const balanceId = mp.market._id;
					if (balanceId) {
						acc[balanceId] = {
							Yes: mp.aggregates.Yes.totalValue,
							No: mp.aggregates.No.totalValue,
						};
					}
				});
				return acc;
			},
			{} as Record<string, SpentEntry>,
		);
	}, [umbrellaPositions]);

	return {
		openPositionsValue,
		unclaimedWinningsPayoutTotal,
		positionsTotalValue,
		portfolioSidePriceMap,
		getCurrentPriceForSide,
		umbrellaBalancesPositions,
		umbrellaBalancesOrders,
		combinedOrders,
		returnsByQid,
		aggregates,
		spentByQid,
	};
}
