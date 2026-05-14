/**
 * Pre-trade balance snapshots and post-trade delta computation. Pure helpers
 * shared by `usePostTradeBalanceSync` and the trade box submit flow.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type {
	RouteExecution,
	RouteLeg,
	RoutePlan,
	SorChain,
	SorVenue,
} from "./sor-types";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";
import type { CollateralChainKey } from "@/trading/sor/fundingStableBalances";
import { COLLATERAL_TOKENS_QUERY_KEY } from "@/context/CollateralTokenContext";
import { canonicalLimitlessTokenId } from "@/trading/limitless/limitlessTokenId";
import { normalizePolymarketPositionTokenId } from "@/trading/polymarket/polymarketPositionsRefetchMerge";
import { limitlessQueryKeys } from "@/trading/limitless/limitlessQueryKeys";
import { getCachedDflowPositions } from "@/trading/dflow/dflowPositionsQueryCache";
import { dflowOutcomeMintForRouteLeg } from "@/trading/dflow/dflowRouteOutcomeMint";
import { normalizePredictTokenId } from "@/trading/predict/predictOrdersApi";

/** Maps a route leg's source-of-funds chain → collateral context key. */
export function chainToCollateralKey(
	chain: SorChain,
	venue: SorVenue,
): CollateralChainKey {
	if (venue === "limitless") return "limitlessMakerBase";
	return chain;
}

export type VenueShareKey = {
	venue: SorVenue;
	/** Stable identity for the position row within a venue. */
	identity: string;
};

export type PostTradeBaseline = {
	/** Per (venue, identity) → pre-trade share count (0 if no row). */
	shares: Map<string, number>;
	/** Per chain → pre-trade USD balance (collateral). */
	cash: Partial<Record<CollateralChainKey, number>>;
	/** LevelUp YES/NO shares for the page market, if applicable. */
	levelUp: { marketId: string; yes: number; no: number } | null;
};

/**
 * Stable identity for a position row, matching the venue-specific keying used
 * in post-trade baseline capture.
 *
 * Optional monitor hints on `ShareIdentityRouteLegContext` align route legs with
 * the same keys as cached positions (Predict.fun outcome token ids).
 */
export type ShareIdentityRouteLegContext = {
	predictFun?: {
		tokenIdA?: string;
		tokenIdB?: string;
	} | null;
};

export function shareIdentityForVenuePosition(p: VenuePosition): string | null {
	switch (p.venue) {
		case "polymarket": {
			const tok = normalizePolymarketPositionTokenId(p.tokenId);
			return tok ? `polymarket:${tok}` : null;
		}
		case "predictfun": {
			const tok = normalizePredictTokenId(p.tokenId ?? "");
			if (tok) return `predictfun:${tok}`;
			if (p.numericMarketId == null || !p.outcome) return null;
			return `predictfun:${p.numericMarketId}|${p.outcome.trim().toLowerCase()}`;
		}
		case "dflow": {
			const t = (p.tokenId ?? "").trim();
			return t ? `dflow:${t}` : null;
		}
		case "limitless": {
			const t = canonicalLimitlessTokenId(p.tokenId);
			return t ? `limitless:${t}` : null;
		}
		default:
			return null;
	}
}

/** Identity for a route leg, mirroring `shareIdentityForVenuePosition`. */
export function shareIdentityForRouteLeg(
	leg: RouteLeg,
	ctx?: ShareIdentityRouteLegContext | null,
): string | null {
	switch (leg.venue) {
		case "polymarket": {
			const raw =
				leg.outcome === "A"
					? leg.venueMarketIds.polyTokenIdA
					: leg.venueMarketIds.polyTokenIdB;
			const tok = normalizePolymarketPositionTokenId(raw);
			return tok ? `polymarket:${tok}` : null;
		}
		case "predictfun": {
			const tokRaw =
				leg.outcome === "A"
					? ctx?.predictFun?.tokenIdA
					: ctx?.predictFun?.tokenIdB;
			const fromMonitor = normalizePredictTokenId(tokRaw ?? "");
			if (fromMonitor) return `predictfun:${fromMonitor}`;
			const raw =
				leg.outcome === "A"
					? leg.venueMarketIds.predictFunMarketIdA
					: leg.venueMarketIds.predictFunMarketIdB;
			if (!raw) return null;
			const n = Number(raw);
			if (!Number.isFinite(n)) return null;
			const yn = leg.outcome === "A" ? "yes" : "no";
			return `predictfun:${n}|${yn}`;
		}
		case "dflow": {
			const mint = dflowOutcomeMintForRouteLeg(leg);
			return mint ? `dflow:${mint}` : null;
		}
		case "limitless": {
			const raw =
				leg.outcome === "A"
					? leg.venueMarketIds.limitlessTokenIdA
					: leg.venueMarketIds.limitlessTokenIdB;
			if (!raw) return null;
			const t = canonicalLimitlessTokenId(raw);
			return t ? `limitless:${t}` : null;
		}
		case "levelup":
			return null;
		default:
			return null;
	}
}

/**
 * Read the current cached share count for a venue/identity from React Query.
 * Returns 0 if no cache or no matching row.
 */
function lookupCachedShares(
	queryClient: QueryClient,
	venue: SorVenue,
	identity: string,
	addresses: PostTradeBaselineAddresses,
): number {
	const findShares = (rows: VenuePosition[] | undefined): number => {
		if (!rows) return 0;
		for (const r of rows) {
			if (r.venue !== venue) continue;
			const id = shareIdentityForVenuePosition(r);
			if (id === identity) return r.shares;
		}
		return 0;
	};

	switch (venue) {
		case "polymarket": {
			const safe = addresses.polymarketSafe?.toLowerCase() ?? null;
			if (!safe) return 0;
			return findShares(
				queryClient.getQueryData<VenuePosition[]>([
					"polymarket-positions",
					safe,
				]),
			);
		}
		case "predictfun": {
			const wallet =
				(addresses.predictWallet ?? "").trim().toLowerCase() || null;
			if (!wallet) return 0;
			const rows = queryClient.getQueryData<VenuePosition[]>([
				"predict-positions",
				wallet,
			]);
			let n = findShares(rows);
			if (n > 0) return n;
			const body = identity.startsWith("predictfun:")
				? identity.slice("predictfun:".length)
				: "";
			if (body !== "" && !body.includes("|")) {
				const want = normalizePredictTokenId(body);
				if (want && rows?.length) {
					for (const r of rows) {
						if (r.venue !== "predictfun") continue;
						if (normalizePredictTokenId(r.tokenId) === want) return r.shares;
					}
				}
			}
			return n;
		}
		case "dflow": {
			const owner = addresses.solanaAddress?.trim() ?? null;
			if (!owner) return 0;
			return findShares(getCachedDflowPositions(queryClient, owner));
		}
		case "limitless": {
			return findShares(
				queryClient.getQueryData<VenuePosition[]>(
					limitlessQueryKeys.positionsVenue,
				),
			);
		}
		default:
			return 0;
	}
}

export type PostTradeBaselineAddresses = {
	polymarketSafe: string | null | undefined;
	predictWallet: string | null | undefined;
	solanaAddress: string | null | undefined;
};

export type PostTradeBaselineInput = {
	queryClient: QueryClient;
	route: RoutePlan;
	addresses: PostTradeBaselineAddresses;
	levelUp: { marketId: string; yesBalance: number; noBalance: number } | null;
	/** Same as post-trade sync — keeps baseline Map keys aligned with `usePredictPositions` rows. */
	shareIdentityCtx?: ShareIdentityRouteLegContext | null;
};

/**
 * Snapshot the pre-trade balances used to detect server-backed divergence after
 * a trade. Read directly from the React Query cache — no fresh fetches at submit time.
 */
export function capturePostTradeBaseline(
	input: PostTradeBaselineInput,
): PostTradeBaseline {
	const shares = new Map<string, number>();
	const cash: Partial<Record<CollateralChainKey, number>> = {};

	for (const leg of input.route.legs) {
		if (leg.venue === "levelup") continue;
		const identity = shareIdentityForRouteLeg(leg, input.shareIdentityCtx);
		if (!identity) continue;
		if (shares.has(identity)) continue;
		shares.set(
			identity,
			lookupCachedShares(
				input.queryClient,
				leg.venue,
				identity,
				input.addresses,
			),
		);
	}

	const cashSnap = input.queryClient.getQueryData<FundingStableBalancesHuman>(
		// Match the queryKey shape, but address parts can vary by render —
		// instead, scan all queries with the COLLATERAL_TOKENS_QUERY_KEY prefix.
		[COLLATERAL_TOKENS_QUERY_KEY],
	);
	if (cashSnap) {
		cash.base = cashSnap.base;
		cash.polygon = cashSnap.polygon;
		cash.bnb = cashSnap.bnb;
		cash.solana = cashSnap.solana;
		if (cashSnap.limitlessMakerBase !== undefined) {
			cash.limitlessMakerBase = cashSnap.limitlessMakerBase;
		}
	} else {
		// Fallback: scan the cache by prefix (the address parts aren't known here).
		const all = input.queryClient.getQueriesData<FundingStableBalancesHuman>({
			queryKey: [COLLATERAL_TOKENS_QUERY_KEY],
		});
		for (const [, data] of all) {
			if (!data) continue;
			cash.base = data.base;
			cash.polygon = data.polygon;
			cash.bnb = data.bnb;
			cash.solana = data.solana;
			if (data.limitlessMakerBase !== undefined) {
				cash.limitlessMakerBase = data.limitlessMakerBase;
			}
			break;
		}
	}

	return {
		shares,
		cash,
		levelUp: input.levelUp
			? {
					marketId: input.levelUp.marketId,
					yes: input.levelUp.yesBalance,
					no: input.levelUp.noBalance,
				}
			: null,
	};
}

/**
 * Filled-leg deltas grouped by venue identity and source chain. Used to select
 * which share rows and cash chains to watch during post-trade sync.
 */
export type ExpectedDeltas = {
	/** Per share-identity → expected post-trade absolute share count. */
	expectedShares: Map<string, number>;
	/** Per chain → expected USD delta (positive = received, negative = spent). */
	cashDeltas: Partial<Record<CollateralChainKey, number>>;
	/** LevelUp leg delta (only one per outcome side per route). */
	levelUp: {
		marketId: string;
		side: "yes" | "no";
		deltaShares: number;
	} | null;
};

export function computeExpectedDeltas(
	route: RoutePlan,
	execution: RouteExecution,
	baseline: PostTradeBaseline,
	shareIdentityCtx?: ShareIdentityRouteLegContext | null,
): ExpectedDeltas {
	const expectedShares = new Map<string, number>();
	const cashDeltas: Partial<Record<CollateralChainKey, number>> = {};
	let levelUp: ExpectedDeltas["levelUp"] = null;

	for (let i = 0; i < execution.legs.length; i++) {
		const ex = execution.legs[i];
		const rl = route.legs[i];
		if (!rl) continue;
		if (ex.status !== "filled") continue;
		const filled = ex.filledShares;
		if (!(filled > 0)) continue;

		// Cash delta on the source chain.
		const avgPrice = Number.isFinite(rl.avgPrice) ? rl.avgPrice : 0;
		const fee = Number.isFinite(rl.fee) ? rl.fee : 0;
		// Bridge cost lands on the source chain too.
		const bridge = rl.bridge?.estimatedCost ?? 0;
		const grossUsd = avgPrice * filled;
		const cashKey = chainToCollateralKey(rl.chain, rl.venue);
		const prev = cashDeltas[cashKey] ?? 0;
		if (route.side === "buy") {
			cashDeltas[cashKey] = prev - (grossUsd + fee + bridge);
		} else {
			cashDeltas[cashKey] = prev + (grossUsd - fee - bridge);
		}

		// Share delta.
		if (rl.venue === "levelup") {
			const marketId = rl.venueMarketIds.levelUpQuestionId?.trim();
			if (marketId && baseline.levelUp?.marketId === marketId) {
				const side: "yes" | "no" = rl.outcome === "A" ? "yes" : "no";
				levelUp = { marketId, side, deltaShares: filled };
			}
			continue;
		}
		const identity = shareIdentityForRouteLeg(rl, shareIdentityCtx);
		if (!identity) continue;
		const cur = expectedShares.get(identity) ?? baseline.shares.get(identity) ?? 0;
		const next =
			route.side === "buy"
				? cur + filled
				: Math.max(0, cur - filled);
		expectedShares.set(identity, next);
	}

	return { expectedShares, cashDeltas, levelUp };
}

/** Tolerance for "balance has converged". */
export const SHARES_CONVERGENCE_TOL = 1e-4;
export const CASH_CONVERGENCE_TOL_USD = 0.01;
