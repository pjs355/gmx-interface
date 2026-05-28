import type { PredictionMarket, MoneylineLeg } from "@/services/api/predictionMarketDataService";
import type {
	Umbrella,
	UmbrellaExchangeMatchingLimitless,
} from "@/services/api/umbrellaDataService";

export type FifaThreeWayOddsContext = {
	homeKey: string;
	drawKey: string;
	awayKey: string;
	subscriptionKeys: [string, string, string];
	columns: {
		home: string;
		draw: string;
		away: string;
	};
	limitlessByLeg: {
		home: UmbrellaExchangeMatchingLimitless | null | undefined;
		draw: UmbrellaExchangeMatchingLimitless | null | undefined;
		away: UmbrellaExchangeMatchingLimitless | null | undefined;
	};
};

function legMarketId(q: PredictionMarket | undefined): string | null {
	const raw = q?.polymarketMarketId;
	if (raw === null || raw === undefined) return null;
	const id = raw.trim();
	return id.length > 0 ? id : null;
}

function limitlessForQuestion(
	q: PredictionMarket | undefined,
): UmbrellaExchangeMatchingLimitless | null | undefined {
	return q?.exchangeMatching?.limitless;
}

/**
 * FIFA polymarket umbrellas: 3 moneyline legs → 3 venue-prices subscribe keys + column labels.
 * Returns null when the umbrella is not a complete home/draw/away set.
 */
export function resolveFifaThreeWayOddsContext(
	umbrella: Umbrella | null | undefined,
	questions: readonly PredictionMarket[] | null | undefined,
): FifaThreeWayOddsContext | null {
	if (umbrella === null || umbrella === undefined) return null;
	if (umbrella.source !== "polymarket") return null;
	if (questions === null || questions === undefined || questions.length === 0) return null;

	const byLeg = new Map<MoneylineLeg, PredictionMarket>();
	for (const q of questions) {
		const leg = q.moneylineLeg;
		if (leg !== "home" && leg !== "draw" && leg !== "away") continue;
		if (legMarketId(q) === null) continue;
		byLeg.set(leg, q);
	}
	if (byLeg.size !== 3) return null;

	const homeQ = byLeg.get("home");
	const drawQ = byLeg.get("draw");
	const awayQ = byLeg.get("away");
	if (homeQ === undefined || drawQ === undefined || awayQ === undefined) return null;

	const homeKey = legMarketId(homeQ);
	const drawKey = legMarketId(drawQ);
	const awayKey = legMarketId(awayQ);
	if (homeKey === null || drawKey === null || awayKey === null) return null;

	const mappings = umbrella.teamMappings ?? [];
	const homeName = mappings[0]?.displayName?.trim();
	const awayName = mappings[1]?.displayName?.trim();
	if (homeName === undefined || homeName.length === 0) {
		throw new Error("FIFA umbrella missing teamMappings[0].displayName for home column");
	}
	if (awayName === undefined || awayName.length === 0) {
		throw new Error("FIFA umbrella missing teamMappings[1].displayName for away column");
	}

	return {
		homeKey,
		drawKey,
		awayKey,
		subscriptionKeys: [homeKey, drawKey, awayKey],
		columns: {
			home: homeName,
			draw: "Draw",
			away: awayName,
		},
		limitlessByLeg: {
			home: limitlessForQuestion(homeQ),
			draw: limitlessForQuestion(drawQ),
			away: limitlessForQuestion(awayQ),
		},
	};
}

export function hasFifaThreeWayOddsContext(
	umbrella: Umbrella | null | undefined,
	questions: readonly PredictionMarket[] | null | undefined,
): boolean {
	return resolveFifaThreeWayOddsContext(umbrella, questions) !== null;
}
