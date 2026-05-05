import { useMemo } from "react";
import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	findMatchedMarketByPolyConditionId,
	inferPolymarketYesNoFromToken,
	parseVsTeamLabelsFromDisplayTitle,
} from "@/trading/polymarket/polyPositionSide";
import { inferPredictSideFromMarketDetail } from "@/trading/predict/predictPositionSide";
import { getPredictPositionRowLabel } from "@/trading/predict/predictPositionLabel";
import {
	buildPredictUmbrellaLookup,
	logPredictUmbrellaOnce,
	matchVenuePositionToUmbrellaForHistory,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import { buildUmbrellaLookupByPolymarketConditionId } from "@/trading/polymarket/polymarketConditionLookup";
import {
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
} from "@/trading/dflow/dflowUmbrellaLookup";
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
import {
	shortPredictFunMarketTitleForPortfolio,
	stripUmbrellaDisplayPrefix,
} from "@/helpers/umbrellaDisplayName";
type TokenBalanceLike = { yesBalance: string | number; noBalance: string | number };

export type UseResolvedUmbrellaPositionsArgs = {
	effectiveAccount: string | null;
	resolvedMarketsByUmbrella: Record<string, PredictionMarket[]>;
	/**
	 * Catalog the matcher and lookups draw from. Pass `historyCatalogUmbrellas` (catalog ∪
	 * `/api/umbrellas/resolve-venue-history` payloads) so DFlow / Polymarket / Predict winnings
	 * can match inactive umbrellas the same way History does.
	 */
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
	/**
	 * History rows already enriched by `useHistoryResolve` with `levelUpUmbrellaId` /
	 * `levelUpUmbrellaDisplayName` + canonical `marketTitle`. We index by `tokenId`
	 * (Solana mint for DFlow, ERC1155 token for Predict/Polymarket/Limitless) and re-use
	 * the same enriched row for the matching winnings row — same contract that makes the
	 * umbrella name + team-name labels work on the History tab today.
	 */
	venueHistory: VenuePosition[];
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
	venueHistory,
}: UseResolvedUmbrellaPositionsArgs): UmbrellaPositions[] {
	/**
	 * `tokenId → enriched row` index from the History resolve pipeline. Each winnings row's
	 * `tokenId` (Solana mint for DFlow / Kalshi, ERC1155 token id for the EVM venues) is the
	 * same identity History already keys on, so we can swap in the patched row 1:1.
	 */
	const enrichedByTokenId = useMemo(() => {
		const map = new Map<string, VenuePosition>();
		for (const row of venueHistory) {
			const id = row.tokenId?.trim();
			if (!id) continue;
			map.set(id, row);
		}
		return map;
	}, [venueHistory]);

	const enrichWithHistoryUmbrella = (raw: VenuePosition): VenuePosition => {
		const id = raw.tokenId?.trim();
		if (!id) return raw;
		const enriched = enrichedByTokenId.get(id);
		if (!enriched) return raw;
		/**
		 * Prefer the History row's umbrella id / display name / canonical title — those are the
		 * fields that flow into `matchVenuePositionToUmbrellaForHistory` and the umbrella-block
		 * label below. Keep `outcomeResult` / `marketStatus` / `shares` / `outcome` from the
		 * winnings source so routing + claim contracts don't drift.
		 */
		return {
			...raw,
			levelUpUmbrellaId:
				enriched.levelUpUmbrellaId?.trim() ||
				raw.levelUpUmbrellaId,
			levelUpUmbrellaDisplayName:
				enriched.levelUpUmbrellaDisplayName?.trim() ||
				raw.levelUpUmbrellaDisplayName,
			marketTitle:
				enriched.marketTitle?.trim() || raw.marketTitle,
		};
	};
	/**
	 * Catalog lookups so DFlow / Kalshi / Polymarket / Limitless winnings rows fold into the
	 * same umbrella block as History (same `matchVenuePositionToUmbrellaForHistory` contract).
	 */
	const polyConditionLookup = useMemo(
		() => buildUmbrellaLookupByPolymarketConditionId(umbrellas),
		[umbrellas],
	);
	const dflowMintLookup = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(umbrellas),
		[umbrellas],
	);
	const dflowEventTickerLookup = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(umbrellas),
		[umbrellas],
	);
	const predictLookupForWinnings = useMemo(
		() =>
			predictUmbrellaLookup ??
			buildPredictUmbrellaLookup(oddsMonitorMarkets ?? null, umbrellas),
		[predictUmbrellaLookup, oddsMonitorMarkets, umbrellas],
	);

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
			rawWinnings: VenuePosition[],
			venue: VenueId,
			idPrefix: string,
			groupKeyFn: (p: VenuePosition) => string,
		) => {
			/**
			 * Replace each raw winnings row with its History-enriched twin (umbrella id +
			 * display name + canonical title) when present. Same identity History already
			 * uses, so the `matchVenuePositionToUmbrellaForHistory` call below sees the
			 * already-resolved `levelUpUmbrellaId` first and short-circuits to the right
			 * umbrella every time the History tab does.
			 */
			const winnings = rawWinnings.map(enrichWithHistoryUmbrella);
			const byGroup = new Map<string, VenuePosition[]>();
			/**
			 * Skip zero-share rows here. After redemption (or floor expiry on DFlow) a winning
			 * row can sit at `shares === 0` and would otherwise render an empty umbrella block
			 * with no claim button — that's the "DFlow market I lost popping up in winnings"
			 * the user reported.
			 */
			for (const pv of winnings) {
				if (!(pv.shares > 0)) continue;
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
				/**
				 * Same matcher History uses for the umbrella block — covers Polymarket condition id,
				 * Predict (token / market / title), DFlow event ticker + mint, Limitless token id, and
				 * server-set `levelUpUmbrellaId`. Falls back to the synthetic umbrella below when no
				 * catalog hit so unmatched venue rows still render.
				 */
				const matchedUmbrella = matchVenuePositionToUmbrellaForHistory(
					first,
					venue,
					polyConditionLookup,
					umbrellas,
					predictLookupForWinnings,
					venue === "predictfun" ? firstWinHint ?? null : null,
					dflowMintLookup,
					dflowEventTickerLookup,
				);
				const matchedDisplayName = stripUmbrellaDisplayPrefix(
					matchedUmbrella?.displayName ?? "",
				).trim();
				const predictFallbackLabel =
					venue === "predictfun"
						? shortPredictFunMarketTitleForPortfolio(
								firstWinHint || first.marketTitle,
							) || first.marketTitle
						: stripUmbrellaDisplayPrefix(first.marketTitle).trim() ||
							first.marketTitle;
				const blockLabel = matchedDisplayName || predictFallbackLabel;
				const umbrellaForWinBlock =
					matchedUmbrella ??
					buildSyntheticUmbrella(
						`${idPrefix}-${first.tokenId.slice(0, 10)}`,
						blockLabel,
						first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
					);
				const blockMarketTitle = blockLabel;
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
						const side: "Yes" | "No" = isYes ? "Yes" : "No";
						/**
						 * Pre-compute the row label so DFlow / Kalshi / Limitless winnings show team
						 * names instead of the raw "Yes" / "No" outcome — same `getPredictPositionRowLabel`
						 * the Positions / History tabs use. Predict keeps its API outcome name first.
						 */
						const titleForLabel = blockMarketTitle || pv.marketTitle;
						const labelOutcomeName =
							venue === "predictfun"
								? inferredW?.teamName ?? pv.outcome
								: pv.outcome;
						const rowLabel = getPredictPositionRowLabel(
							titleForLabel,
							labelOutcomeName,
							side,
						);
						const dflowRedeemShares =
							venue === "dflow" ? pv.shares : undefined;
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
								...(dflowRedeemShares != null
									? { _dflowRedeemShares: dflowRedeemShares }
									: {}),
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
							predictOutcomeLabelYes: isYes ? rowLabel : undefined,
							predictOutcomeLabelNo: isYes ? undefined : rowLabel,
						};
					})
					.filter(
						(mp) =>
							!claimedMarkets.has((mp.market as { _id: string })._id),
					);
				if (markets.length > 0) {
					if (venue === "predictfun" && !matchedUmbrella) {
						logPredictUmbrellaOnce(
							"winnings-synthetic-block",
							String(first.numericMarketId ?? first.tokenId ?? ""),
							{
								syntheticLabelSample: blockLabel.slice(0, 220),
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

		/**
		 * Group key prefers the catalog umbrella id (matches the History grouping). Falls back to
		 * a venue-natural identity (predict market id, polymarket eventSlug, dflow event ticker /
		 * mint, limitless eventSlug) so unmatched rows still bucket together sensibly.
		 */
		const venueUmbrellaIdForGroup = (
			raw: VenuePosition,
			venue: VenueId,
		): string | null => {
			const p = enrichWithHistoryUmbrella(raw);
			const hintDetail =
				venue === "predictfun" && p.numericMarketId != null
					? predictMarketDetails.get(p.numericMarketId)
					: undefined;
			const hint =
				(hintDetail?.question ?? hintDetail?.title ?? "").trim() || null;
			const u = matchVenuePositionToUmbrellaForHistory(
				p,
				venue,
				polyConditionLookup,
				umbrellas,
				predictLookupForWinnings,
				venue === "predictfun" ? hint : null,
				dflowMintLookup,
				dflowEventTickerLookup,
			);
			return u?._id ?? null;
		};

		appendVenueWinnings(predictWinnings, "predictfun", "predict-win", (p) => {
			const uid = venueUmbrellaIdForGroup(p, "predictfun");
			return uid ?? String(p.numericMarketId ?? p.tokenId);
		});
		appendVenueWinnings(polyWinnings, "polymarket", "poly-win", (p) => {
			const uid = venueUmbrellaIdForGroup(p, "polymarket");
			return uid ?? (p.eventSlug || p.marketTitle);
		});
		appendVenueWinnings(dflowWinnings, "dflow", "dflow-win", (p) => {
			const uid = venueUmbrellaIdForGroup(p, "dflow");
			return uid ?? (p.dflowEventTicker || p.marketTitle || p.tokenId);
		});
		appendVenueWinnings(limitlessWinnings, "limitless", "lx-win", (p) => {
			const uid = venueUmbrellaIdForGroup(p, "limitless");
			return uid ?? (p.eventSlug || p.marketTitle || p.tokenId);
		});

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
		predictLookupForWinnings,
		polyConditionLookup,
		dflowMintLookup,
		dflowEventTickerLookup,
		oddsMonitorMarkets,
		enrichedByTokenId,
	]);
}
