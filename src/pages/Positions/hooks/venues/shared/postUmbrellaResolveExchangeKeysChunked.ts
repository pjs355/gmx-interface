import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { UmbrellaExchangeResolveQuery } from "@/trading/umbrellaVenueResolveKey";

/** Must stay aligned with server `RESOLVE_EXCHANGE_KEYS_MAX_QUERIES` (resolve-exchange-keys + resolve-venue-history). */
export const UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES = 80;

export type UmbrellaResolveExchangeKeysResponse = {
	success: boolean;
	data?: {
		byClientKey: Record<string, { umbrellaId?: string; displayName?: string }>;
		umbrellasById?: Record<string, Umbrella>;
	};
};

/**
 * Calls the umbrella resolve-exchange-keys POST endpoint, splitting `queries` into chunks of
 * `UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES` so the server never sees a request that breaches its
 * `RESOLVE_EXCHANGE_KEYS_MAX_QUERIES` cap. Successful chunk results are merged into a single
 * `byClientKey` / `umbrellasById` payload.
 */
export async function postUmbrellaResolveExchangeKeysChunked(
	post: (body: {
		queries: UmbrellaExchangeResolveQuery[];
		includeUmbrellaPayloads?: boolean;
	}) => Promise<UmbrellaResolveExchangeKeysResponse>,
	queries: UmbrellaExchangeResolveQuery[],
): Promise<UmbrellaResolveExchangeKeysResponse> {
	if (queries.length <= UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES) {
		return post({ queries, includeUmbrellaPayloads: true });
	}
	const byClientKey: Record<string, { umbrellaId?: string; displayName?: string }> = {};
	const umbrellasById: Record<string, Umbrella> = {};
	let anySuccess = false;
	for (let i = 0; i < queries.length; i += UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES) {
		const chunk = queries.slice(i, i + UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES);
		const res = await post({ queries: chunk, includeUmbrellaPayloads: true });
		if (res.success && res.data) {
			anySuccess = true;
			Object.assign(byClientKey, res.data.byClientKey ?? {});
			Object.assign(umbrellasById, res.data.umbrellasById ?? {});
		}
	}
	return {
		success: anySuccess,
		data: { byClientKey, umbrellasById },
	};
}
