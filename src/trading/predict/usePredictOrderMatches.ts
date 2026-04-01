import { useQuery } from "@tanstack/react-query";
import { getAddress } from "ethers";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";

export type UsePredictOrderMatchesOptions = {
	/** Prefer `VITE_PREDICT_ACCOUNT_ADDRESS`; else embedded BNB EOA (hex). */
	signerAddress: string | null | undefined;
	/**
	 * When true, fetches match events for cost fallback (API key path; no Predict JWT).
	 * Typical: Predict positions exist but `GET /v1/orders` returned no FILLED rows.
	 */
	enabled: boolean;
};

/**
 * Fetches `GET /api/predict/orders/matches` when enabled. Address is EIP-55 checksummed
 * for backends that require it.
 */
export function usePredictOrderMatches(opts: UsePredictOrderMatchesOptions) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();

	let filterSigner: string | null = null;
	try {
		const raw = opts.signerAddress?.trim();
		if (raw?.startsWith("0x")) filterSigner = getAddress(raw);
	} catch {
		filterSigner = null;
	}

	const ready = Boolean(authenticated && opts.enabled && filterSigner);

	const query = useQuery({
		queryKey: ["predict-order-matches", filterSigner],
		enabled: ready,
		staleTime: 60_000,
		retry: 1,
		queryFn: async () =>
			api.getPredictOrderMatches({
				first: "200",
				signerAddress: filterSigner!,
			}),
		meta: { errorMessage: "Predict.fun order matches" },
	});

	return {
		...query,
		filterSigner,
	};
}
