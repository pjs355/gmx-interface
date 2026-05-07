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
import { resolvePredictAccountAddress } from "@/trading/predict/resolvePredictAccountAddress";
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
import {
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
	lookupUmbrellaByDflowEventTicker,
	mintMatchesDflowExchange,
} from "@/trading/dflow/dflowUmbrellaLookup";
import type { TradingVenue } from "../types";

const VENUE_SUFFIX: Record<VenueId | "levelup", string> = {
	levelup: "LevelUp",
	polymarket: "Polymarket",
	predictfun: "Predict",
	dflow: "Kalshi",
	limitless: "Limitless",
};

/**
 * Trade-box `loading` should not block on venue portfolios that are irrelevant to the
 * open match — otherwise one hung Limitless / Polymarket fetch keeps Predict-only flows
 * spinning forever. When the monitor row is not wired yet, stay conservative and wait on
 * every enabled venue query.
 */
function shareBalanceLoadingWaitsForVenue(
	matchedMonitor: MatchedMarket | null | undefined,
	venue: "polymarket" | "predictfun" | "dflow" | "limitless",
): boolean {
	if (!matchedMonitor) return true;
	switch (venue) {
		case "polymarket":
			return Boolean(matchedMonitor.polyConditionId?.trim());
		case "predictfun": {
			const pf = matchedMonitor.predictFun;
			return Boolean(
				(pf?.marketIdA != null && String(pf.marketIdA).trim() !== "") ||
					(pf?.marketIdB != null && String(pf.marketIdB).trim() !== "") ||
					(pf?.tokenIdA != null && String(pf.tokenIdA).trim() !== "") ||
					(pf?.tokenIdB != null && String(pf.tokenIdB).trim() !== ""),
			);
		}
		case "dflow":
			return Boolean(
				matchedMonitor.dflow?.eventTicker?.trim() ||
					matchedMonitor.kalshi?.eventTicker?.trim(),
			);
		case "limitless": {
			const lx = matchedMonitor.limitless;
			return Boolean(
				lx?.slug?.trim() ||
					(Boolean(lx?.tokenIdA?.trim()) && Boolean(lx?.tokenIdB?.trim())),
			);
		}
		default:
			return true;
	}
}

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
	/** Per-venue rows for YES / NO long positions — powers buy-tab breakdown like sell. */
	buyVenueBreakdownByOutcome: {
		yes: SellVenueBreakdownRow[];
		no: SellVenueBreakdownRow[];
	};
	sellTotalShares: number;
	sellVenueBreakdown: SellVenueBreakdownRow[];
	sellOutcomeLabel: string;
	loading: boolean;
	/**
	 * Per-venue share counts for YES/NO across all matched venues for this page market.
	 * Always computed (never `null`) so the trade box can feed SOR + render the
	 * highest-bid-where-held strip on every tab, not just All Markets.
	 */
	allMarketsOutcomeVenueShares: { yes: Record<string, number>; no: Record<string, number> };
};

/**
 * Match venue row to open umbrella for trade-box share breakdown.
 *
 * Per-venue identity rules (no title fallback for venues with unique on-chain ids — two
 * different "Natus vs FaZe" matches share the same `displayName` but distinct mints / tickers,
 * so a title fallback misattributes last week's winnings to this week's umbrella):
 *   - polymarket → `conditionId`
 *   - dflow / kalshi → `dflowEventTicker` then outcome `tokenId` (Solana mint)
 *   - levelup / limitless / other → fall back to display-name match (legacy contract)
 */
function umbrellaForPosition(
	pos: VenuePosition,
	umbrellas: Umbrella[],
	condLookup: Map<string, Umbrella>,
	dflowMintLookup: Map<string, Umbrella>,
	dflowEventTickerLookup: Map<string, Umbrella>,
): Umbrella | null {
	const k = polymarketConditionLookupKey(pos.conditionId ?? "");
	if (k && condLookup.has(k)) {
		return condLookup.get(k)!;
	}
	if (pos.venue === "dflow") {
		const et = pos.dflowEventTicker?.trim();
		if (et) {
			const byEt = lookupUmbrellaByDflowEventTicker(
				et,
				dflowEventTickerLookup,
				umbrellas,
			);
			if (byEt) return byEt;
		}
		if (pos.tokenId?.trim()) {
			const mint = pos.tokenId.trim();
			const hit = dflowMintLookup.get(mint);
			if (hit) return hit;
			for (const u of umbrellas) {
				if (mintMatchesDflowExchange(u.exchangeMatching?.dflow, mint)) return u;
			}
		}
		/**
		 * No event-ticker / mint hit → position is for a different DFlow market (commonly a
		 * prior week's match with the same teams). Title-matching here would misattribute
		 * last week's "Natus vs FaZe" winnings to this week's umbrella.
		 */
		return null;
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
	/**
	 * DFlow market identity = mint + event ticker. The umbrella-level match above already
	 * vetted this position belongs to the open umbrella; falling back to a title check here
	 * pulls in last-week's same-named match (e.g. "Natus vs FaZe Match Winner"). Trust the
	 * umbrella resolution and gate on it.
	 */
	if (pos.venue === "dflow") return true;
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
	const cidKey = polymarketConditionLookupKey(cid);
	const pageCidKey = polymarketConditionLookupKey(pageCid);
	const matchedFromPage =
		pageMatchedMonitor && cidKey && pageCidKey && cidKey === pageCidKey
			? pageMatchedMonitor
			: null;
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

function buildOutcomeVenueBreakdownRows(
	outcome: "yes" | "no",
	levelBalances: { yes: number; no: number },
	relevantVenuePositions: VenuePosition[],
	matchedOddsMarkets: MatchedMarket[] | null | undefined,
	pageMatchedMonitor: MatchedMarket | null | undefined,
	isVsSingle: boolean,
	yesTeamLabel: string,
	noTeamLabel: string,
): SellVenueBreakdownRow[] {
	const byVenue = new Map<string, number>();
	const add = (venueKey: string, shares: number) => {
		if (!Number.isFinite(shares) || shares <= 0) return;
		byVenue.set(venueKey, (byVenue.get(venueKey) ?? 0) + shares);
	};
	const lu = outcome === "yes" ? levelBalances.yes : levelBalances.no;
	add("levelup", lu);
	for (const p of relevantVenuePositions) {
		const side = venuePositionToYesNo(
			p,
			matchedOddsMarkets,
			pageMatchedMonitor,
			isVsSingle,
			yesTeamLabel,
			noTeamLabel,
		);
		if (side !== outcome) continue;
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
	return rows;
}

/**
 * Share balances for the trade widget. Always aggregates across every venue
 * for the active page market; the `tradingVenue` prop is accepted for API
 * compatibility but no longer narrows the breakdown — the SmartRoutingSection
 * auto-selects a single venue mid-render once SOR resolves, and that must not
 * make existing positions disappear from the widget.
 */
export function useTradeBoxShareBalances(opts: {
	umbrellaId: string | undefined;
	market: MarketRef | null | undefined;
	/** Accepted for API compatibility; not consulted for the breakdown anymore. */
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
	/**
	 * Same wallet as {@link usePositionsData} / {@link PortfolioProvider}: Predict.fun
	 * is keyed off the embedded signer (BNB), not the Base SCW `account` when they
	 * differ. `resolvePredictAccountAddress` is the canonical normalizer so all
	 * three call sites (here, PortfolioContext, usePredictBundle) hit the same
	 * TanStack key.
	 */
	const predictQueryWallet = resolvePredictAccountAddress(
		signerAddress,
		account,
	);
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

	const dflowMintLookup = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(umbrellas),
		[umbrellas],
	);

	const dflowEventTickerLookup = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(umbrellas),
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
		const polyMonitorKey = polymarketConditionLookupKey(polyMonitorCid);

		for (const p of [
			...(polyQ.data ?? []),
			...(predictQ.data ?? []),
			...(dflowQ.data ?? []),
			...(limitlessVenueQ.data ?? []),
		]) {
			const k = dedupeKey(p);
			if (seen.has(k)) continue;

			let keep = false;
			if (p.venue === "polymarket" && polyMonitorKey) {
				const pcKey = polymarketConditionLookupKey(
					String(p.conditionId ?? "").trim(),
				);
				if (pcKey && pcKey === polyMonitorKey) keep = true;
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
				const u = umbrellaForPosition(
					p,
					umbrellas,
					condLookup,
					dflowMintLookup,
					dflowEventTickerLookup,
				);
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
		dflowMintLookup,
		dflowEventTickerLookup,
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

	const waitPoly = shareBalanceLoadingWaitsForVenue(pageMatchedMonitor, "polymarket");
	const waitPredict = shareBalanceLoadingWaitsForVenue(
		pageMatchedMonitor,
		"predictfun",
	);
	const waitDflow = shareBalanceLoadingWaitsForVenue(pageMatchedMonitor, "dflow");
	const waitLimitless = shareBalanceLoadingWaitsForVenue(
		pageMatchedMonitor,
		"limitless",
	);

	const loading =
		Boolean(umbrellaId && account) &&
		((waitPoly && polyQ.isLoading) ||
			(waitPredict && predictQ.isLoading) ||
			(waitDflow && dflowRpcEnabled && dflowQ.isLoading) ||
			(waitLimitless && limitlessPortfolioEnabled && limitlessVenueQ.isLoading));

	// Always aggregate across every venue regardless of `state.tradingVenue` —
	// the SmartRoutingSection auto-select can flip `tradingVenue` to a single
	// venue mid-render (when SOR finds a single-venue best route), and we don't
	// want the breakdown to "drop" the other venues' shares.
	const lines = useMemo((): TradeBoxShareLine[] => {
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
	}, [
		umbrellaId,
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

	const buyVenueBreakdownByOutcome = useMemo(
		() => ({
			yes: buildOutcomeVenueBreakdownRows(
				"yes",
				levelBalances,
				relevantVenuePositions,
				matchedOddsMarkets,
				pageMatchedMonitor,
				isVsSingle,
				yesTeamLabel,
				noTeamLabel,
			),
			no: buildOutcomeVenueBreakdownRows(
				"no",
				levelBalances,
				relevantVenuePositions,
				matchedOddsMarkets,
				pageMatchedMonitor,
				isVsSingle,
				yesTeamLabel,
				noTeamLabel,
			),
		}),
		[
			levelBalances,
			relevantVenuePositions,
			matchedOddsMarkets,
			pageMatchedMonitor,
			isVsSingle,
			yesTeamLabel,
			noTeamLabel,
		],
	);

	const sellOutcomeLabel = useMemo(() => {
		const yesLabel = isVsSingle ? yesTeamLabel : "Yes";
		const noLabel = isVsSingle ? noTeamLabel : "No";
		if (selectedPosition === "yes") return yesLabel;
		if (selectedPosition === "no") return noLabel;
		return yesLabel;
	}, [isVsSingle, yesTeamLabel, noTeamLabel, selectedPosition]);

	// Sell breakdown is always all-venues — same rationale as `lines` above.
	// SOR sell options surface per-venue rows in SmartRoutingSection; this strip
	// just shows what's available regardless of the auto-selected route.
	const { sellTotalShares, sellVenueBreakdown } = useMemo(() => {
		if (!selectedPosition) {
			return { sellTotalShares: 0, sellVenueBreakdown: [] as SellVenueBreakdownRow[] };
		}
		const rows = buildOutcomeVenueBreakdownRows(
			selectedPosition,
			levelBalances,
			relevantVenuePositions,
			matchedOddsMarkets,
			pageMatchedMonitor,
			isVsSingle,
			yesTeamLabel,
			noTeamLabel,
		);
		const total = rows.reduce((s, r) => s + r.shares, 0);
		return { sellTotalShares: total, sellVenueBreakdown: rows };
	}, [
		selectedPosition,
		isVsSingle,
		yesTeamLabel,
		noTeamLabel,
		levelBalances,
		relevantVenuePositions,
		matchedOddsMarkets,
		pageMatchedMonitor,
	]);

	/**
	 * Per-venue YES/NO share counts for the active page market — computed on every
	 * tab (not just All Markets). Source of truth for `sorVenuePositions` (Polymarket
	 * + DFlow) and the highest-bid-where-held strip on the YES/NO buttons.
	 */
	const allMarketsOutcomeVenueShares = useMemo(() => {
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
		buyVenueBreakdownByOutcome,
		sellTotalShares,
		sellVenueBreakdown,
		sellOutcomeLabel,
		loading,
		allMarketsOutcomeVenueShares,
	};
}
