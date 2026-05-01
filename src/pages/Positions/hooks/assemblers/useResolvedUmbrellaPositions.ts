import { useMemo } from "react";
import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	findMatchedMarketByPolyConditionId,
	inferPolymarketYesNoFromToken,
	parseVsTeamLabelsFromDisplayTitle,
} from "@/trading/polymarket/polyPositionSide";
import { inferPredictSideFromMarketDetail } from "@/trading/predict/predictPositionSide";
import {
	logPredictUmbrellaOnce,
	resolvePredictUmbrellaForDisplay,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	type VenueId,
	type VenuePosition,
} from "@/types/trading/venuePosition";
import {
	type MarketPosition,
	type UmbrellaPositions,
	buildSyntheticUmbrella,
} from "../../utils/positionHelpers";
import { shortPredictFunMarketTitleForPortfolio } from "@/helpers/umbrellaDisplayName";

type TokenBalanceLike = { yesBalance: string | number; noBalance: string | number };

export type UseResolvedUmbrellaPositionsArgs = {
	effectiveAccount: string | null;
	resolvedMarketsByUmbrella: Record<string, PredictionMarket[]>;
	umbrellas: Umbrella[];
	tokenBalances: Map<string, TokenBalanceLike>;
	userDataLoading: boolean;
	claimedMarkets: Set<string>;
	predictWinnings: VenuePosition[];
	polyWinnings: VenuePosition[];
	dflowWinnings: VenuePosition[];
	limitlessWinnings: VenuePosition[];
	predictMarketDetails: Map<number, PredictMarketDetail>;
	predictUmbrellaLookup: PredictUmbrellaLookup;
	oddsMonitorMarkets: MatchedMarket[] | undefined;
};

export function useResolvedUmbrellaPositions({
	effectiveAccount,
	resolvedMarketsByUmbrella,
	umbrellas,
	tokenBalances,
	userDataLoading,
	claimedMarkets,
	predictWinnings,
	polyWinnings,
	dflowWinnings,
	limitlessWinnings,
	predictMarketDetails,
	predictUmbrellaLookup,
	oddsMonitorMarkets,
}: UseResolvedUmbrellaPositionsArgs): UmbrellaPositions[] {
	return useMemo(() => {
		if (!effectiveAccount) return [];
		const oddsMarkets = oddsMonitorMarkets ?? [];
		const resolved: UmbrellaPositions[] = [];

		Object.entries(resolvedMarketsByUmbrella).forEach(
			([umbrellaId, resolvedMarkets]) => {
				if (resolvedMarkets.length === 0) return;
				let umbrella = umbrellas.find((u) => u._id === umbrellaId);
				if (!umbrella) {
					const firstMarket = resolvedMarkets[0];
					umbrella = {
						_id: umbrellaId,
						displayName:
							firstMarket?.umbrellaName ||
							`Umbrella ${umbrellaId.slice(0, 8)}...`,
						children: resolvedMarkets,
						originalChildren: resolvedMarkets,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						__v: 0,
					} as Umbrella;
				}

				const res = resolvedMarkets
					.map((m) => {
						const balanceId = (m as { _id?: string })._id;
						const tb = balanceId ? tokenBalances.get(balanceId) : undefined;
						return {
							market: m,
							yesBalance: tb ? Number(tb.yesBalance) : 0,
							noBalance: tb ? Number(tb.noBalance) : 0,
						};
					})
					.filter((mp) => {
						const balanceId = (mp.market as { _id?: string })._id;
						if (balanceId && claimedMarkets.has(balanceId)) return false;
						const outcome = String(
							(mp.market as { resolvedOutcome?: string }).resolvedOutcome || "",
						).toLowerCase();
						if (
							(outcome === "yes" && mp.yesBalance > 0) ||
							(outcome === "no" && mp.noBalance > 0)
						) {
							return true;
						}
						// On-chain token balance for this market may not be in `tokenBalances` yet after refresh.
						// Don't drop the row until the map actually contains the key (avoids 0/1/2 flapping).
						if (
							userDataLoading &&
							balanceId &&
							!tokenBalances.has(String(balanceId))
						) {
							return true;
						}
						return false;
					})
					.map(
						(mp) =>
							({
								market: mp.market,
								yesBalance: mp.yesBalance,
								noBalance: mp.noBalance,
								yesPrice: null,
								noPrice: null,
								yesValue: 0,
								noValue: 0,
								totalValue: 0,
								orders: [],
								aggregates: {
									Yes: {
										totalSize: 0,
										totalValue: 0,
										avgPrice: null,
										count: 0,
									},
									No: {
										totalSize: 0,
										totalValue: 0,
										avgPrice: null,
										count: 0,
									},
								},
							}) as MarketPosition,
					);

				if (res.length > 0) resolved.push({ umbrella, markets: res });
			},
		);

		const appendVenueWinnings = (
			winnings: VenuePosition[],
			venue: VenueId,
			idPrefix: string,
			groupKeyFn: (p: VenuePosition) => string,
		) => {
			const byGroup = new Map<string, VenuePosition[]>();
			for (const pv of winnings) {
				const key = groupKeyFn(pv);
				const arr = byGroup.get(key) ?? [];
				arr.push(pv);
				byGroup.set(key, arr);
			}
			for (const [, positions] of byGroup) {
				const first = positions[0];
				const firstWinDetail =
					venue === "predictfun" && first.numericMarketId != null
						? predictMarketDetails.get(first.numericMarketId)
						: undefined;
				const firstWinHint =
					(firstWinDetail?.question ?? firstWinDetail?.title ?? "").trim() ||
					undefined;
				const resolvedPredictWin =
					venue === "predictfun"
						? resolvePredictUmbrellaForDisplay(
								first,
								predictUmbrellaLookup,
								umbrellas,
								firstWinHint,
							)
						: null;
				const predictWinSyntheticLabel =
					venue === "predictfun"
						? resolvedPredictWin?.displayName?.trim() ||
							shortPredictFunMarketTitleForPortfolio(
								firstWinHint || first.marketTitle,
							) ||
							first.marketTitle
						: first.marketTitle;
				const umbrellaForWinBlock =
					resolvedPredictWin ??
					buildSyntheticUmbrella(
						`${idPrefix}-${first.tokenId.slice(0, 10)}`,
						predictWinSyntheticLabel,
						first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
					);
				const blockMarketTitle =
					venue === "predictfun"
						? resolvedPredictWin?.displayName?.trim() ||
							shortPredictFunMarketTitleForPortfolio(
								firstWinHint || first.marketTitle,
							) ||
							first.marketTitle
						: first.marketTitle;
				const markets: MarketPosition[] = positions
					.map((pv) => {
						const mDetail =
							venue === "predictfun" && pv.numericMarketId != null
								? predictMarketDetails.get(pv.numericMarketId)
								: undefined;
						const inferredW =
							venue === "predictfun"
								? inferPredictSideFromMarketDetail(
										mDetail ?? undefined,
										pv.tokenId,
									)
								: null;
						const polyWinRow =
							venue === "polymarket"
								? findMatchedMarketByPolyConditionId(
										oddsMarkets,
										pv.conditionId,
									)
								: null;
						const polyWinLabels =
							venue === "polymarket"
								? (parseVsTeamLabelsFromDisplayTitle(pv.marketTitle) ??
									parseVsTeamLabelsFromDisplayTitle(blockMarketTitle))
								: null;
						const polyWinInf =
							venue === "polymarket" && polyWinRow && polyWinLabels
								? inferPolymarketYesNoFromToken(
										pv,
										polyWinRow,
										polyWinLabels.yesTeamLabel,
										polyWinLabels.noTeamLabel,
									)
								: null;
						const isYes =
							venue === "limitless"
								? pv.outcome.trim().toLowerCase() === "yes"
								: venue === "polymarket"
									? polyWinInf
										? polyWinInf.side === "Yes"
										: pv.outcome.toLowerCase() === "yes" ||
											(pv.outcome.toLowerCase() !== "no" &&
												(pv.marketTitle?.toLowerCase() ?? "").includes(
													pv.outcome.toLowerCase(),
												))
									: inferredW != null
										? inferredW.side === "Yes"
										: pv.outcome.toLowerCase() === "yes" ||
											(pv.outcome.toLowerCase() !== "no" &&
												(pv.marketTitle?.toLowerCase() ?? "").includes(
													pv.outcome.toLowerCase(),
												));
						const teamLabel =
							venue === "predictfun"
								? (inferredW?.teamName ?? pv.outcome)
								: pv.outcome;
						return {
							market: {
								_id: `${idPrefix}-${pv.tokenId.slice(0, 12)}`,
								displayName: blockMarketTitle,
								questionId: pv.conditionId ?? pv.tokenId,
								conditionId: pv.conditionId,
								resolvedOutcome: isYes ? "yes" : "no",
								_venue: venue,
								_isNegRisk: mDetail?.isNegRisk ?? false,
								_isYieldBearing: mDetail?.isYieldBearing ?? false,
							} as unknown as PredictionMarket,
							yesBalance: isYes ? pv.shares : 0,
							noBalance: isYes ? 0 : pv.shares,
							yesPrice: null,
							noPrice: null,
							yesValue: 0,
							noValue: 0,
							totalValue: 0,
							orders: [],
							aggregates: {
								Yes: {
									totalSize: 0,
									totalValue: 0,
									avgPrice: null,
									count: 0,
								},
								No: {
									totalSize: 0,
									totalValue: 0,
									avgPrice: null,
									count: 0,
								},
							},
							venue,
							predictOutcomeLabelYes:
								venue === "predictfun" && isYes ? teamLabel : undefined,
							predictOutcomeLabelNo:
								venue === "predictfun" && !isYes ? teamLabel : undefined,
						};
					})
					.filter(
						(mp) =>
							!claimedMarkets.has((mp.market as { _id: string })._id),
					);
				if (markets.length > 0) {
					if (venue === "predictfun" && !resolvedPredictWin) {
						logPredictUmbrellaOnce(
							"winnings-synthetic-block",
							String(first.numericMarketId ?? first.tokenId ?? ""),
							{
								syntheticLabelSample: predictWinSyntheticLabel.slice(0, 220),
								hadMarketDetailsHint: Boolean(firstWinHint),
								hintSample: firstWinHint?.slice(0, 220),
								numericMarketId: first.numericMarketId,
								tokenIdSample: String(first.tokenId ?? "").slice(0, 32),
								positionsInGroup: positions.length,
							},
						);
					}
					resolved.push({ umbrella: umbrellaForWinBlock, markets });
				}
			}
		};

		appendVenueWinnings(predictWinnings, "predictfun", "predict-win", (p) => {
			const d =
				p.numericMarketId != null
					? predictMarketDetails.get(p.numericMarketId)
					: undefined;
			const hint = (d?.question ?? d?.title ?? "").trim() || undefined;
			const u = resolvePredictUmbrellaForDisplay(
				p,
				predictUmbrellaLookup,
				umbrellas,
				hint,
			);
			return u?._id ?? String(p.numericMarketId ?? p.tokenId);
		});
		appendVenueWinnings(
			polyWinnings,
			"polymarket",
			"poly-win",
			(p) => p.eventSlug || p.marketTitle,
		);
		appendVenueWinnings(
			dflowWinnings,
			"dflow",
			"dflow-win",
			(p) => p.marketTitle || p.tokenId,
		);
		appendVenueWinnings(
			limitlessWinnings,
			"limitless",
			"lx-win",
			(p) => p.eventSlug || p.marketTitle || p.tokenId,
		);

		return resolved;
	}, [
		effectiveAccount,
		resolvedMarketsByUmbrella,
		umbrellas,
		tokenBalances,
		userDataLoading,
		claimedMarkets,
		predictWinnings,
		polyWinnings,
		dflowWinnings,
		limitlessWinnings,
		predictMarketDetails,
		predictUmbrellaLookup,
		oddsMonitorMarkets,
	]);
}
