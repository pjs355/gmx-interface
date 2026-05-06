/**
 * Canonical address used as the cache key + URL slug for the Predict.fun
 * positions endpoint (`/api/predict/positions/:addr`).
 *
 * Three call sites historically derived this differently:
 *   - `PortfolioContext` used `signerAddress ?? account`
 *   - `usePredictBundle` used `signerAddress ?? effectiveAccount`
 *   - `useTradeBoxShareBalances` used `(signerAddress?.trim() || account?.trim()) || null`
 *
 * The resulting strings nearly always matched once login settled, but during
 * the brief window where one was still empty the React Query cache treated
 * them as different keys and issued a duplicate `/api/predict/positions`
 * request. Routing all callers through this helper guarantees one cache key
 * per user, which is the contract `usePredictPositions` relies on.
 *
 * Returns lowercase form because `usePredictPositions` already lowercases its
 * key internally — pre-normalizing here avoids the "two casings, two cache
 * entries" failure mode.
 */
export function resolvePredictAccountAddress(
	signerAddress: string | null | undefined,
	account: string | null | undefined
): string | null {
	const candidate =
		(typeof signerAddress === "string" && signerAddress.trim()) ||
		(typeof account === "string" && account.trim()) ||
		"";
	if (!candidate) return null;
	return candidate.toLowerCase();
}
