import { useEffect, useMemo, useState } from "react";
import { useUserData } from "@/context/UserDataContext";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useSignerContext } from "@/context/SignerContext";
import { usePrivy } from "@privy-io/react-auth";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useLimitlessVenuePositions } from "@/trading/limitless/useLimitlessPortfolioVenue";
import { limitlessVenuePositionMatchesPageMarket } from "@/trading/limitless/limitlessTradeBoxMatch";
import { debugLimitlessPortfolio } from "@/trading/limitless/limitlessPortfolioDebug";
import { canonicalLimitlessTokenId } from "@/trading/limitless/limitlessTokenId";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import { titlesMatchVenue } from "@/helpers/umbrellaDisplayName";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition, VenueId } from "@/types/trading/venuePosition";
import {
	findMatchedMarketByPolyConditionId,
	inferPolymarketYesNoFromToken,
} from "@/trading/polymarket/polyPositionSide";
import {
	buildUmbrellaLookupByPolymarketConditionId,
	polymarketConditionLookupKey,
} from "@/trading/polymarket/polymarketConditionLookup";
import type { TradingVenue } from "../types";

const VENUE_SUFFIX: Record<VenueId | "levelup", string> = {
	levelup: "LevelUp",
	polymarket: "Polymarket",
	predictfun: "Predict",
	dflow: "Kalshi",
	limitless: "Limitless",
};

type MarketRef = {
	_id?: string;
	questionId?: string;
	displayName?: string;
	question?: string;
	conditionId?: string;
};

export type TradeBoxShareLine = {
	key: string;
	side: "yes" | "no";
	label: string;
	shares: number;
	venueSuffix: string | null;
};

export type SellVenueBreakdownRow = {
	key: string;
	venueDisplay: string;
	shares: number;
};

/** Snapshot from `useTradeBoxShareBalances` for child components (single hook instance in parent). */
export type TradeBoxShareBalancesSnapshot = {
	buyLines: TradeBoxShareLine[];
	sellTotalShares: number;
	sellVenueBreakdown: SellVenueBreakdownRow[];
	sellOutcomeLabel: string;
	loading: boolean;
	/** Per-venue share counts for YES/NO when on “All Markets” (keys = `VenuePosition.venue`). */
	allMarketsOutcomeVenueShares: { yes: Record<string, number>; no: Record<string, number> } | null;
};

function umbrellaForPosition(
	pos: VenuePosition,
	umbrellas: Umbrella[],
	condLookup: Map<string, Umbrella>,
): Umbrella | null {
	const k = polymarketConditionLookupKey(pos.conditionId ?? "");
	if (k && condLookup.has(k)) {
		return condLookup.get(k)!;
	}
	return (
		umbrellas.find((u) => titlesMatchVenue(u.displayName ?? "", pos.marketTitle ?? "")) ?? null
	);
}

function positionMatchesMarket(pos: VenuePosition, market: MarketRef): boolean {
	const mid = (market.conditionId || "").trim();
	const pid = (pos.conditionId || "").trim();
	if (mid && pid && polymarketConditionLookupKey(mid) === polymarketConditionLookupKey(pid)) {
		return true;
	}
	const mt = (market.displayName || market.question || "").trim();
	const pt = (pos.marketTitle || "").trim();
	if (!mt || !pt) return false;
	if (titlesMatchVenue(mt, pt)) return true;
	const ml = mt.toLowerCase();
	const pl = pt.toLowerCase();
	return pl.includes(ml) || ml.includes(pl);
}

/** Match Polymarket/Predict positions to the open market via any umbrella sibling `conditionId`. */
function positionMatchesMarketOrSiblings(
	pos: VenuePosition,
	market: MarketRef,
	siblingConditionIds: Set<string>,
): boolean {
	const pidKey = polymarketConditionLookupKey((pos.conditionId || "").trim());
	if (pidKey && siblingConditionIds.size > 0 && siblingConditionIds.has(pidKey)) return true;
	return positionMatchesMarket(pos, market);
}

function buildSiblingConditionIdSet(
	umbrellaId: string | undefined,
	market: MarketRef | null | undefined,
	allMarketsByUmbrella: Record<string, unknown[]>,
): Set<string> {
	const set = new Set<string>();
	if (!umbrellaId || !market) return set;
	const markets = allMarketsByUmbrella[umbrellaId];
	if (!markets?.length) return set;
	for (const m of markets) {
		const cid = String((m as { conditionId?: string }).conditionId ?? "").trim();
		if (cid) set.add(polymarketConditionLookupKey(cid));
	}
	const mid = (market.conditionId || "").trim();
	if (mid) set.add(polymarketConditionLookupKey(mid));
	return set;
}

function outcomeToSide(
	outcome: string,
	isVsSingle: boolean,
	yesL: string,
	noL: string,
): "yes" | "no" | null {
	const o = outcome.trim().toLowerCase();
	if (!isVsSingle) {
		if (o === "yes" || o === "y") return "yes";
		if (o === "no" || o === "n") return "no";
		return null;
	}
	const y = yesL.trim().toLowerCase();
	const n = noL.trim().toLowerCase();
	if (y && (o === y || o.includes(y) || y.includes(o))) return "yes";
	if (n && (o === n || o.includes(n) || n.includes(o))) return "no";
	if (o === "yes") return "yes";
	if (o === "no") return "no";
	return null;
}

/** Polymarket: same token mapping as trade box / portfolio ({@link inferPolymarketYesNoFromToken}). */
function polymarketPositionToYesNo(
	p: VenuePosition,
	matchedMarkets: MatchedMarket[] | null | undefined,
	pageMatchedMonitor: MatchedMarket | null | undefined,
	isVsSingle: boolean,
	yesTeamLabel: string,
	noTeamLabel: string,
): "yes" | "no" | null {
	const cid = (p.conditionId ?? "").trim();
	const pageCid = pageMatchedMonitor
		? String(pageMatchedMonitor.polyConditionId ?? "").trim()
		: "";
	const matchedFromPage =
		pageMatchedMonitor && cid && pageCid && cid === pageCid ? pageMatchedMonitor : null;
	const matched =
		matchedFromPage ?? findMatchedMarketByPolyConditionId(matchedMarkets, p.conditionId);
	if (matched) {
		const inf = inferPolymarketYesNoFromToken(p, matched, yesTeamLabel, noTeamLabel);
		if (inf) return inf.side === "Yes" ? "yes" : "no";
	}
	return outcomeToSide(p.outcome, isVsSingle, yesTeamLabel, noTeamLabel);
}

function venuePositionToYesNo(
	p: VenuePosition,
	matchedMarkets: MatchedMarket[] | null | undefined,
	pageMatchedMonitor: MatchedMarket | null | undefined,
	isVsSingle: boolean,
	yesTeamLabel: string,
	noTeamLabel: string,
): "yes" | "no" | null {
	if (p.venue === "polymarket") {
		return polymarketPositionToYesNo(
			p,
			matchedMarkets,
			pageMatchedMonitor,
			isVsSingle,
			yesTeamLabel,
			noTeamLabel,
		);
	}
	if (p.venue === "limitless") {
		const lx = pageMatchedMonitor?.limitless;
		if (lx?.tokenIdA && lx?.tokenIdB) {
			const tid = canonicalLimitlessTokenId(p.tokenId);
			const a = canonicalLimitlessTokenId(String(lx.tokenIdA));
			const b = canonicalLimitlessTokenId(String(lx.tokenIdB));
			if (tid === a) return "yes";
			if (tid === b) return "no";
		}
	}
	return outcomeToSide(p.outcome, isVsSingle, yesTeamLabel, noTeamLabel);
}

function mapTradingVenueFilter(v: TradingVenue): VenueId | "levelup" | "all" {
	if (v === "levelup") return "levelup";
	if (v === "polymarket") return "polymarket";
	if (v === "predictfun") return "predictfun";
	if (v === "dflow") return "dflow";
	if (v === "limitless") return "limitless";
	return "all";
}

/**
 * Share balances for the trade widget: aggregates across venues on “All Markets”,
 * and venue-scoped lines with a “(Predict)” style suffix on a single-venue tab.
 */
export function useTradeBoxShareBalances(opts: {
	umbrellaId: string | undefined;
	market: MarketRef | null | undefined;
	tradingVenue: TradingVenue;
	yesTeamLabel: string;
	noTeamLabel: string;
	isVsSingle: boolean;
	/** Used for sell headline / breakdown for the outcome the user is trading. */
	selectedPosition: "yes" | "no" | null;
	/** Same row as orderbooks — preferred for Poly tokenId → Yes/No before WS list lookup. */
	matchedMonitor?: MatchedMarket | null;
}): TradeBoxShareBalancesSnapshot {
	const {
		umbrellaId,
		market,
		tradingVenue,
		yesTeamLabel,
		noTeamLabel,
		isVsSingle,
		selectedPosition,
		matchedMonitor: pageMatchedMonitor,
	} = opts;
	const { account, signerAddress } = useSignerContext();
	const { getTokenBalance } = useUserData();
	const { umbrellas, allMarketsByUmbrella } = usePredictionData();
	const { appState } = useOddsMonitor();
	const matchedOddsMarkets = appState?.markets;
	const { polymarketSafe, solanaAddress, limitlessMakerBase } = useFundingAddresses();
	const privateApi = usePrivateApiClient();
	const { authenticated } = usePrivy();

	const [venueReady, setVenueReady] = useState(false);
	useEffect(() => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const rafId = requestAnimationFrame(() => {
			timeoutId = setTimeout(() => setVenueReady(true), 0);
		});
		return () => {
			cancelAnimationFrame(rafId);
			if (timeoutId !== null) clearTimeout(timeoutId);
		};
	}, []);

	const limitlessPortfolioEnabled =
		Boolean(authenticated) && Boolean(limitlessMakerBase?.trim());
	const limitlessVenueQ = useLimitlessVenuePositions(
		venueReady && limitlessPortfolioEnabled,
	);
	const dflowProof = useDflowProofStatus();

	const venueEnabled =
		venueReady && Boolean(account && (polymarketSafe || (account as string)?.length));

	const polyQ = usePolymarketPositions(venueEnabled ? polymarketSafe : null);
	/** Same wallet as {@link usePositionsData} / {@link PortfolioProvider}: Predict.fun is keyed off the embedded signer (BNB), not the Base SCW `account` when they differ. */
	const predictQueryWallet = (signerAddress?.trim() || account?.trim()) || null;
	const predictQ = usePredictPositions(
		venueEnabled && predictQueryWallet ? predictQueryWallet : null,
	);

	const solanaLinked = Boolean(solanaAddress?.trim());
	const dflowRpcEnabled =
		venueReady &&
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;
	const dflowQ = useDflowPositions(venueReady ? solanaAddress : null, privateApi, {
		enabled: dflowRpcEnabled,
	});

	const condLookup = useMemo(
		() => buildUmbrellaLookupByPolymarketConditionId(umbrellas),
		[umbrellas],
	);

	const siblingConditionIds = useMemo(
		() => buildSiblingConditionIdSet(umbrellaId, market ?? undefined, allMarketsByUmbrella),
		[umbrellaId, market, allMarketsByUmbrella],
	);

	const relevantVenuePositions = useMemo(() => {
		if (!umbrellaId || !market) return [];
		const out: VenuePosition[] = [];
		const seen = new Set<string>();
		const dedupeKey = (p: VenuePosition) => `${p.venue}:${p.tokenId}`;

		/** Same CLOB as the page’s {@link MatchedMarket} — matches SOR sell (polyOutcomeTokenId), not umbrella child index. */
		const polyMonitorCid = pageMatchedMonitor
			? String(pageMatchedMonitor.polyConditionId ?? "").trim()
			: "";

		for (const p of [
			...(polyQ.data ?? []),
			...(predictQ.data ?? []),
			...(dflowQ.data ?? []),
			...(limitlessVenueQ.data ?? []),
		]) {
			const k = dedupeKey(p);
			if (seen.has(k)) continue;

			let keep = false;
			if (p.venue === "polymarket" && polyMonitorCid) {
				const pc = String(p.conditionId ?? "").trim();
				if (pc === polyMonitorCid) keep = true;
			}
			if (!keep && p.venue === "limitless" && umbrellaId) {
				const uTarget = umbrellas.find((u) => u._id === umbrellaId);
				if (
					uTarget &&
					limitlessVenuePositionMatchesPageMarket(
						p,
						uTarget,
						pageMatchedMonitor ?? null,
					)
				) {
					keep = true;
				}
			}
			if (!keep) {
				const u = umbrellaForPosition(p, umbrellas, condLookup);
				if (!u || u._id !== umbrellaId) continue;
				if (!positionMatchesMarketOrSiblings(p, market, siblingConditionIds)) continue;
				keep = true;
			}

			if (keep) {
				seen.add(k);
				out.push(p);
			}
		}
		return out;
	}, [
		umbrellaId,
		market,
		umbrellas,
		condLookup,
		siblingConditionIds,
		pageMatchedMonitor,
		polyQ.data,
		predictQ.data,
		dflowQ.data,
		limitlessVenueQ.data,
	]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		if (!umbrellaId) return;
		const lx = relevantVenuePositions.filter((p) => p.venue === "limitless");
		if (lx.length === 0) return;
		const uTarget = umbrellas.find((u) => u._id === umbrellaId);
		debugLimitlessPortfolio("Trade box: limitless rows included in share aggregate", {
			umbrellaId,
			monitorLimitless: pageMatchedMonitor?.limitless
				? {
						tokenIdA: String(pageMatchedMonitor.limitless.tokenIdA ?? "").slice(-16),
						tokenIdB: String(pageMatchedMonitor.limitless.tokenIdB ?? "").slice(-16),
					}
				: null,
			rows: lx.map((p) => {
				const bySlugToken =
					uTarget &&
					limitlessVenuePositionMatchesPageMarket(
						p,
						uTarget,
						pageMatchedMonitor ?? null,
					);
				const yn = venuePositionToYesNo(
					p,
					matchedOddsMarkets,
					pageMatchedMonitor,
					isVsSingle,
					yesTeamLabel,
					noTeamLabel,
				);
				return {
					title: (p.marketTitle ?? "").slice(0, 56),
					outcomeString: p.outcome,
					marketStatus: p.marketStatus,
					shares: p.shares,
					tokenTail: (p.tokenId ?? "").slice(-16),
					matchedBySlugTokenMonitor: Boolean(bySlugToken),
					tradeBoxYesNo: yn,
					note: "Uses monitor tokenIdA/B for Yes/No when present; History tab uses inferVenueHistoryYesNoSide(title,outcome) on venueHistory rows instead",
				};
			}),
		});
	}, [
		umbrellaId,
		relevantVenuePositions,
		umbrellas,
		pageMatchedMonitor,
		matchedOddsMarkets,
		isVsSingle,
		yesTeamLabel,
		noTeamLabel,
	]);

	const levelBalances = useMemo(() => {
		const marketId = market?._id || market?.questionId;
		const tb = marketId ? getTokenBalance(marketId) : null;
		const yesNum = tb ? Number(tb.yesBalance) : 0;
		const noNum = tb ? Number(tb.noBalance) : 0;
		return {
			yes: Number.isFinite(yesNum) ? yesNum : 0,
			no: Number.isFinite(noNum) ? noNum : 0,
		};
	}, [market?._id, market?.questionId, getTokenBalance]);

	const loading =
		Boolean(umbrellaId && account) &&
		(polyQ.isLoading ||
			predictQ.isLoading ||
			(dflowRpcEnabled && dflowQ.isLoading) ||
			(limitlessPortfolioEnabled && limitlessVenueQ.isLoading));

	const lines = useMemo((): TradeBoxShareLine[] => {
		const mode = mapTradingVenueFilter(tradingVenue);
		const yesLabel = isVsSingle ? yesTeamLabel : "Yes";
		const noLabel = isVsSingle ? noTeamLabel : "No";

		// No umbrella context: LevelUp token balances only (legacy path).
		if (!umbrellaId) {
			const yes = levelBalances.yes;
			const no = levelBalances.no;
			const out: TradeBoxShareLine[] = [];
			if (yes > 0) {
				out.push({
					key: "lu-yes",
					side: "yes",
					label: yesLabel,
					shares: yes,
					venueSuffix: null,
				});
			}
			if (no > 0) {
				out.push({
					key: "lu-no",
					side: "no",
					label: noLabel,
					shares: no,
					venueSuffix: null,
				});
			}
			return out;
		}

		if (mode === "all") {
			let yes = levelBalances.yes;
			let no = levelBalances.no;
			for (const p of relevantVenuePositions) {
				const side = venuePositionToYesNo(
					p,
					matchedOddsMarkets,
					pageMatchedMonitor,
					isVsSingle,
					yesTeamLabel,
					noTeamLabel,
				);
				if (side === "yes") yes += p.shares;
				else if (side === "no") no += p.shares;
			}
			const out: TradeBoxShareLine[] = [];
			if (yes > 0) {
				out.push({
					key: "agg-yes",
					side: "yes",
					label: yesLabel,
					shares: yes,
					venueSuffix: null,
				});
			}
			if (no > 0) {
				out.push({
					key: "agg-no",
					side: "no",
					label: noLabel,
					shares: no,
					venueSuffix: null,
				});
			}
			return out;
		}

		let yes = 0;
		let no = 0;
		if (mode === "levelup") {
			yes = levelBalances.yes;
			no = levelBalances.no;
		} else {
			for (const p of relevantVenuePositions) {
				if (p.venue !== mode) continue;
				const side = venuePositionToYesNo(
					p,
					matchedOddsMarkets,
					pageMatchedMonitor,
					isVsSingle,
					yesTeamLabel,
					noTeamLabel,
				);
				if (side === "yes") yes += p.shares;
				else if (side === "no") no += p.shares;
			}
		}

		const suffix = `(${VENUE_SUFFIX[mode]})`;
		const out: TradeBoxShareLine[] = [];
		if (yes > 0) {
			out.push({
				key: `${mode}-yes`,
				side: "yes",
				label: yesLabel,
				shares: yes,
				venueSuffix: suffix,
			});
		}
		if (no > 0) {
			out.push({
				key: `${mode}-no`,
				side: "no",
				label: noLabel,
				shares: no,
				venueSuffix: suffix,
			});
		}
		return out;
	}, [
		umbrellaId,
		tradingVenue,
		isVsSingle,
		yesTeamLabel,
		noTeamLabel,
		levelBalances,
		relevantVenuePositions,
		appState?.markets,
		appState?.timestamp,
		pageMatchedMonitor,
	]);

	const buyLines = useMemo(
		() => lines.map((l) => ({ ...l, venueSuffix: null })),
		[lines],
	);

	const sellOutcomeLabel = useMemo(() => {
		const yesLabel = isVsSingle ? yesTeamLabel : "Yes";
		const noLabel = isVsSingle ? noTeamLabel : "No";
		if (selectedPosition === "yes") return yesLabel;
		if (selectedPosition === "no") return noLabel;
		return yesLabel;
	}, [isVsSingle, yesTeamLabel, noTeamLabel, selectedPosition]);

	const { sellTotalShares, sellVenueBreakdown } = useMemo(() => {
		const mode = mapTradingVenueFilter(tradingVenue);
		const byVenue = new Map<string, number>();
		if (!selectedPosition) {
			return { sellTotalShares: 0, sellVenueBreakdown: [] as SellVenueBreakdownRow[] };
		}

		const add = (venueKey: string, shares: number) => {
			if (!Number.isFinite(shares) || shares <= 0) return;
			byVenue.set(venueKey, (byVenue.get(venueKey) ?? 0) + shares);
		};

		const lu =
			selectedPosition === "yes" ? levelBalances.yes : levelBalances.no;
		if (mode === "all" || mode === "levelup") {
			add("levelup", lu);
		}

		for (const p of relevantVenuePositions) {
			const side = venuePositionToYesNo(
				p,
				matchedOddsMarkets,
				pageMatchedMonitor,
				isVsSingle,
				yesTeamLabel,
				noTeamLabel,
			);
			if (side !== selectedPosition) continue;
			if (mode !== "all" && p.venue !== mode) continue;
			add(p.venue, p.shares);
		}

		const venueOrder = ["levelup", "polymarket", "predictfun", "dflow"] as const;
		const rows: SellVenueBreakdownRow[] = [];
		for (const key of venueOrder) {
			const sh = byVenue.get(key);
			if (sh != null && sh > 0) {
				const display =
					key === "levelup"
						? VENUE_SUFFIX.levelup
						: VENUE_SUFFIX[key as VenueId];
				rows.push({ key, venueDisplay: display, shares: sh });
			}
		}
		for (const [key, sh] of byVenue) {
			if (venueOrder.includes(key as (typeof venueOrder)[number])) continue;
			if (sh > 0) rows.push({ key, venueDisplay: key, shares: sh });
		}

		const total = rows.reduce((s, r) => s + r.shares, 0);
		return { sellTotalShares: total, sellVenueBreakdown: rows };
	}, [
		tradingVenue,
		selectedPosition,
		isVsSingle,
		yesTeamLabel,
		noTeamLabel,
		levelBalances,
		relevantVenuePositions,
		appState?.markets,
		appState?.timestamp,
		pageMatchedMonitor,
	]);

	const allMarketsOutcomeVenueShares = useMemo(() => {
		if (mapTradingVenueFilter(tradingVenue) !== "all") return null;
		const yes: Record<string, number> = {};
		const no: Record<string, number> = {};
		const add = (target: Record<string, number>, venueKey: string, sh: number) => {
			if (!Number.isFinite(sh) || sh <= 0) return;
			target[venueKey] = (target[venueKey] ?? 0) + sh;
		};
		if (levelBalances.yes > 0) add(yes, "levelup", levelBalances.yes);
		if (levelBalances.no > 0) add(no, "levelup", levelBalances.no);
		for (const p of relevantVenuePositions) {
			const side = venuePositionToYesNo(
				p,
				matchedOddsMarkets,
				pageMatchedMonitor,
				isVsSingle,
				yesTeamLabel,
				noTeamLabel,
			);
			if (side === "yes") add(yes, p.venue, p.shares);
			else if (side === "no") add(no, p.venue, p.shares);
		}
		return { yes, no };
	}, [
		tradingVenue,
		isVsSingle,
		yesTeamLabel,
		noTeamLabel,
		levelBalances,
		relevantVenuePositions,
		appState?.markets,
		appState?.timestamp,
		pageMatchedMonitor,
	]);

	return {
		buyLines,
		sellTotalShares,
		sellVenueBreakdown,
		sellOutcomeLabel,
		loading,
		allMarketsOutcomeVenueShares,
	};
}
