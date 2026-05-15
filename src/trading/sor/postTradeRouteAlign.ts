import type { AccountVenueKey } from "@/context/AccountDataContext";
import type { ExecutionLeg, RouteExecution, RoutePlan, SorVenue } from "./sor-types";

/**
 * When `routeId` differs between submit snapshot and completion (re-quote / race),
 * still treat the execution as the same trade if every leg's venue matches in order.
 */
export function routePlanLegsFingerprintMatch(
	route: RoutePlan,
	execution: RouteExecution,
): boolean {
	const rl = route.legs;
	const el = execution.legs;
	if (!rl?.length || rl.length !== el.length) return false;
	for (let i = 0; i < rl.length; i++) {
		if (rl[i]?.venue !== el[i]?.venue) return false;
	}
	return true;
}

const SOR_VENUE_TO_ACCOUNT: Partial<Record<SorVenue, AccountVenueKey>> = {
	polymarket: "polymarket",
	predictfun: "predict",
	dflow: "dflow",
	limitless: "limitless",
};

/** Unique `AccountVenueKey`s from legs that actually filled (for blind refresh). */
export function accountVenueKeysFromFilledExecutionLegs(
	legs: readonly ExecutionLeg[],
): AccountVenueKey[] {
	const out: AccountVenueKey[] = [];
	const seen = new Set<AccountVenueKey>();
	for (const leg of legs) {
		if (leg.status !== "filled" || !(leg.filledShares > 0)) continue;
		const key = SOR_VENUE_TO_ACCOUNT[leg.venue];
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(key);
	}
	return out;
}

export function filledExecutionHasLevelUp(
	legs: readonly ExecutionLeg[],
): boolean {
	return legs.some(
		(l) =>
			l.venue === "levelup" && l.status === "filled" && l.filledShares > 0,
	);
}
