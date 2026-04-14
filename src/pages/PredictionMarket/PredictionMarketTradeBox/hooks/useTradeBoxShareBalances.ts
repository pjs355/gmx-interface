import { useEffect, useMemo, useState } from "react";
import { useUserData } from "@/context/UserDataContext";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useSignerContext } from "@/context/SignerContext";
import { usePrivy } from "@privy-io/react-auth";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import { titlesMatchVenue } from "@/helpers/umbrellaDisplayName";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition, VenueId } from "@/types/trading/venuePosition";
import type { TradingVenue } from "../types";

const VENUE_SUFFIX: Record<VenueId | "levelup", string> = {
	levelup: "LevelUp",
	polymarket: "Polymarket",
	predictfun: "Predict",
	dflow: "Kalshi",
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

function buildConditionUmbrellaLookup(umbrellas: Umbrella[]): Map<string, Umbrella> {
	const map = new Map<string, Umbrella>();
	for (const umb of umbrellas) {
		const children = (umb as { originalChildren?: unknown[] }).originalChildren ?? umb.children ?? [];
		for (const child of children as { conditionId?: string; marketId?: string }[]) {
			if (child.conditionId) map.set(child.conditionId, umb);
			if (child.marketId) map.set(child.marketId, umb);
		}
	}
	return map;
}

function umbrellaForPosition(
	pos: VenuePosition,
	umbrellas: Umbrella[],
	condLookup: Map<string, Umbrella>,
): Umbrella | null {
	if (pos.conditionId && condLookup.has(pos.conditionId)) {
		return condLookup.get(pos.conditionId)!;
	}
	return (
		umbrellas.find((u) => titlesMatchVenue(u.displayName ?? "", pos.marketTitle ?? "")) ?? null
	);
}

function positionMatchesMarket(pos: VenuePosition, market: MarketRef): boolean {
	const mid = (market.conditionId || "").trim();
	const pid = (pos.conditionId || "").trim();
	if (mid && pid) return mid === pid;
	const mt = (market.displayName || market.question || "").trim();
	const pt = (pos.marketTitle || "").trim();
	if (!mt || !pt) return false;
	if (titlesMatchVenue(mt, pt)) return true;
	const ml = mt.toLowerCase();
	const pl = pt.toLowerCase();
	return pl.includes(ml) || ml.includes(pl);
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

function mapTradingVenueFilter(v: TradingVenue): VenueId | "levelup" | "all" {
	if (v === "levelup") return "levelup";
	if (v === "polymarket") return "polymarket";
	if (v === "predictfun") return "predictfun";
	if (v === "dflow") return "dflow";
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
}): { lines: TradeBoxShareLine[]; loading: boolean } {
	const { umbrellaId, market, tradingVenue, yesTeamLabel, noTeamLabel, isVsSingle } = opts;
	const { account } = useSignerContext();
	const { getTokenBalance } = useUserData();
	const { umbrellas } = usePredictionData();
	const { polymarketSafe, solanaAddress } = useFundingAddresses();
	const privateApi = usePrivateApiClient();
	const { authenticated } = usePrivy();
	const dflowProof = useDflowProofStatus();

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

	const venueEnabled =
		venueReady && Boolean(account && (polymarketSafe || (account as string)?.length));

	const polyQ = usePolymarketPositions(venueEnabled ? polymarketSafe : null);
	const predictQ = usePredictPositions(venueEnabled ? account : null);

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

	const condLookup = useMemo(() => buildConditionUmbrellaLookup(umbrellas), [umbrellas]);

	const relevantVenuePositions = useMemo(() => {
		if (!umbrellaId || !market) return [];
		const out: VenuePosition[] = [];
		for (const p of [
			...(polyQ.data ?? []),
			...(predictQ.data ?? []),
			...(dflowQ.data ?? []),
		]) {
			const u = umbrellaForPosition(p, umbrellas, condLookup);
			if (!u || u._id !== umbrellaId) continue;
			if (!positionMatchesMarket(p, market)) continue;
			out.push(p);
		}
		return out;
	}, [
		umbrellaId,
		market,
		umbrellas,
		condLookup,
		polyQ.data,
		predictQ.data,
		dflowQ.data,
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
		(polyQ.isLoading || predictQ.isLoading || (dflowRpcEnabled && dflowQ.isLoading));

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
				const side = outcomeToSide(p.outcome, isVsSingle, yesTeamLabel, noTeamLabel);
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
				const side = outcomeToSide(p.outcome, isVsSingle, yesTeamLabel, noTeamLabel);
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
	]);

	return { lines, loading };
}
