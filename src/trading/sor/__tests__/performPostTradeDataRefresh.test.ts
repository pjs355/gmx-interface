import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { limitlessQueryKeys } from "@/trading/venues/limitless/trade/limitlessQueryKeys";
import type { PostTradeBaseline, PostTradeBaselineAddresses } from "@/trading/sor/post-trade/postTradeBaseline";
import type { RouteExecution, RouteLeg, RoutePlan } from "../core/sor-types";
import {
	buildWatchTargets,
	filterUnresolvedPending,
	levelUpShareDirectionResolved,
	pendingWatchTargetsResolved,
	performPostTradeDataRefreshPass,
	venueShareDirectionResolved,
} from "../post-trade/performPostTradeDataRefresh";

const emptyAddresses: PostTradeBaselineAddresses = {
	polymarketSafe: null,
	predictWallet: null,
	solanaAddress: null,
};

function limitlessRow(shares: number, slug = "evt-a"): VenuePosition {
	return {
		venue: "limitless",
		marketTitle: "t",
		outcome: "yes",
		shares,
		avgPrice: null,
		currentPrice: null,
		cost: null,
		currentValue: 0,
		pnl: null,
		pnlPercent: null,
		tokenId: "tok",
		eventSlug: slug,
	};
}

describe("post-trade share direction vs baseline", () => {
	it("venue: null observed means unknown (not resolved)", () => {
		expect(venueShareDirectionResolved("buy", null, 10)).toBeNull();
	});

	it("venue: buy unresolved on stale equal balance", () => {
		expect(venueShareDirectionResolved("buy", 10, 10)).toBe(false);
	});

	it("venue: buy resolved on strict increase", () => {
		expect(venueShareDirectionResolved("buy", 10.01, 10)).toBe(true);
	});

	it("venue: sell resolved when row is 0 and baseline positive", () => {
		expect(venueShareDirectionResolved("sell", 0, 5)).toBe(true);
	});

	it("venue: sell baseline 0 treated as resolved in helper", () => {
		expect(venueShareDirectionResolved("sell", 0, 0)).toBe(true);
	});

	it("levelUp: keyed and empty marketId use same strict rules", () => {
		expect(levelUpShareDirectionResolved("buy", 2, 2)).toBe(false);
		expect(levelUpShareDirectionResolved("buy", 2.5, 2)).toBe(true);
		expect(levelUpShareDirectionResolved("sell", 4, 10)).toBe(true);
		expect(levelUpShareDirectionResolved("sell", 10, 10)).toBe(false);
		expect(levelUpShareDirectionResolved("sell", 0, 0)).toBe(true);
	});

	it("pendingWatchTargetsResolved: venue null when positions query missing", () => {
		const qc = new QueryClient();
		const pending = [
			{
				kind: "shares" as const,
				venue: "limitless" as const,
				identity: "limitless:leg:evt-a",
				baselineShares: 1,
				expectedSharesAbs: 2,
				routeSide: "buy" as const,
			},
		];
		expect(
			pendingWatchTargetsResolved(pending, qc, emptyAddresses, () => 0),
		).toBe(false);
	});

	it("pendingWatchTargetsResolved: venue hydrated and directional move", () => {
		const qc = new QueryClient();
		qc.setQueryData(limitlessQueryKeys.positionsVenue, [limitlessRow(3)]);
		const pending = [
			{
				kind: "shares" as const,
				venue: "limitless" as const,
				identity: "limitless:leg:evt-a",
				baselineShares: 1,
				expectedSharesAbs: 2,
				routeSide: "buy" as const,
			},
		];
		expect(
			pendingWatchTargetsResolved(pending, qc, emptyAddresses, () => 0),
		).toBe(true);
	});

	it("filterUnresolvedPending keeps venue row until query hydrates", () => {
		const qc = new QueryClient();
		const pending = [
			{
				kind: "shares" as const,
				venue: "limitless" as const,
				identity: "limitless:leg:evt-a",
				baselineShares: 1,
				expectedSharesAbs: 2,
				routeSide: "buy" as const,
			},
		];
		expect(filterUnresolvedPending(pending, qc, emptyAddresses, () => 0)).toHaveLength(
			1,
		);
		qc.setQueryData(limitlessQueryKeys.positionsVenue, [limitlessRow(3)]);
		expect(filterUnresolvedPending(pending, qc, emptyAddresses, () => 0)).toHaveLength(
			0,
		);
	});

	it("LevelUp empty marketId uses strict direction (no tolerance shortcut)", () => {
		const qc = new QueryClient();
		const pending = [
			{
				kind: "levelup" as const,
				marketId: "",
				side: "yes" as const,
				baselineLevelUp: 5,
				expectedLevelUpAbs: 2,
				routeSide: "sell" as const,
			},
		];
		expect(
			pendingWatchTargetsResolved(pending, qc, emptyAddresses, () => 3),
		).toBe(true);
		expect(
			pendingWatchTargetsResolved(pending, qc, emptyAddresses, () => 5),
		).toBe(false);
	});

	it("buildWatchTargets omits venue share target when sell and baseline shares are 0", () => {
		const tokenId = "999888777666";
		const polyLeg: RouteLeg = {
			venue: "polymarket",
			chain: "polygon",
			outcome: "A",
			shares: 5,
			avgPrice: 0.5,
			executionAmountUsd: 2.5,
			fee: 0,
			priceImpact: 0,
			estimatedTimeSeconds: 0,
			bridge: null,
			minSharesAtSlippage: 0,
			venueMarketIds: { venue: "polymarket", polyTokenIdA: tokenId },
			orderType: "market",
		};
		const route: RoutePlan = {
			routeId: "r",
			pandaMatchId: "p",
			outcome: "A",
			side: "sell",
			requestedAmount: 5,
			legs: [polyLeg],
			totalShares: 5,
			totalCost: 1,
			totalFees: 0,
			totalBridgeCost: 0,
			remainder: 0,
			singleVenueBest: {
				venue: "polymarket",
				shares: 5,
				totalCost: 1,
				effectivePrice: 0.2,
			},
			savingsVsSingleVenue: { extraShares: 0, percentImprovement: 0 },
			estimatedExecutionTimeSeconds: 0,
			degraded: false,
			insufficientLiquidity: false,
			venuesConsidered: [],
			venuesExcluded: [],
			venueRequirements: {},
			hmac: "",
			expiresAt: Date.now() + 60_000,
			computedInMs: 0,
		};
		const execution: RouteExecution = {
			routeId: "r",
			status: "done",
			legs: [
				{
					venue: "polymarket",
					status: "filled",
					shares: 5,
					filledShares: 5,
					updatedAt: 0,
				},
			],
			totalFilledShares: 5,
			totalSpent: 0,
			createdAt: 0,
			updatedAt: 0,
			remainingBudget: 0,
		};
		const id = `polymarket:${BigInt(tokenId).toString()}`;
		const baseline: PostTradeBaseline = {
			shares: new Map<string, number>([[id, 0]]),
			cash: {},
			levelUp: null,
		};
		const pending = buildWatchTargets(route, execution, baseline, null);
		expect(pending.filter((t) => t.kind === "shares")).toHaveLength(0);
	});
});

describe("performPostTradeDataRefreshPass", () => {
	it("invalidates polymarket-positions and refetches venue positions", async () => {
		const qc = new QueryClient();
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
		const refetchSpy = vi.spyOn(qc, "refetchQueries");

		const refreshVenuePositions = vi.fn().mockResolvedValue(undefined);
		const refreshCash = vi.fn().mockResolvedValue(undefined);
		const refreshLevelUp = vi.fn().mockResolvedValue(undefined);

		await performPostTradeDataRefreshPass(
			qc,
			{
				refreshLevelUpPositions: refreshLevelUp,
				refreshLevelUpOrders: vi.fn().mockResolvedValue(undefined),
			},
			{ refreshVenuePositions, refreshCash },
			{
				venueShareKeys: ["polymarket"],
				predictMarketSupplement: false,
				dflowOutcomeBalance: false,
				limitlessPortfolioAndCollateral: false,
				levelUpRpc: false,
				cash: false,
			},
		);

		expect(
			invalidateSpy.mock.calls.some(
				(c) =>
					Array.isArray(c[0]?.queryKey) && c[0].queryKey[0] === "polymarket-positions",
			),
		).toBe(true);
		expect(refreshVenuePositions).toHaveBeenCalledWith("polymarket");
		expect(refreshCash).not.toHaveBeenCalled();
		// predict-market refetch only when predictMarketSupplement
		expect(
			refetchSpy.mock.calls.some(
				(c) =>
					Array.isArray(c[0]?.queryKey) && c[0].queryKey[0] === "predict-market",
			),
		).toBe(false);
	});

	it("refetches predict-market when predict supplement requested", async () => {
		const qc = new QueryClient();
		const refetchSpy = vi.spyOn(qc, "refetchQueries");

		await performPostTradeDataRefreshPass(
			qc,
			{
				refreshLevelUpPositions: vi.fn(),
				refreshLevelUpOrders: vi.fn().mockResolvedValue(undefined),
			},
			{
				refreshVenuePositions: vi.fn().mockResolvedValue(undefined),
				refreshCash: vi.fn().mockResolvedValue(undefined),
			},
			{
				venueShareKeys: ["predict"],
				predictMarketSupplement: false,
				dflowOutcomeBalance: false,
				limitlessPortfolioAndCollateral: false,
				levelUpRpc: false,
				cash: false,
			},
		);

		expect(
			refetchSpy.mock.calls.some(
				(c) =>
					Array.isArray(c[0]?.queryKey) && c[0].queryKey[0] === "predict-market",
			),
		).toBe(true);
	});
});
