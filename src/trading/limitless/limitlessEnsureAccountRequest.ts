import type { QueryClient } from "@tanstack/react-query";
import { readLimitlessOwnerIdFromEnsurePayload } from "./limitlessEnsureTradeGate";

/**
 * Builds `POST /api/limitless/ensure-account` body only when the cached ensure
 * payload has no partner `ownerId` yet. Avoids redundant Privy `personal_sign`
 * prompts on every refetch after the sub-account is linked.
 */
export async function postLimitlessEnsureAccountWhenNeeded(
	queryClient: QueryClient,
	ensureQueryKey: readonly unknown[],
	cachedEnsureData: unknown,
	buildEoaBody: () => Promise<Record<string, unknown> | undefined>,
	postEnsure: (
		body?: Record<string, unknown>,
	) => Promise<unknown>,
): Promise<unknown> {
	const ownerId =
		readLimitlessOwnerIdFromEnsurePayload(cachedEnsureData) ??
		readLimitlessOwnerIdFromEnsurePayload(
			queryClient.getQueryData(ensureQueryKey),
		);
	const body =
		ownerId == null ? await buildEoaBody().catch(() => undefined) : undefined;
	return postEnsure(body);
}
