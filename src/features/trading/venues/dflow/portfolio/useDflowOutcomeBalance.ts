import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";

/**
 * Reads the Token-2022 balance for a single DFlow outcome mint via
 * `POST /api/dflow/token-balances` (server private Solana RPC).
 */
export function useDflowOutcomeBalance(
	solanaAddress: string | null | undefined,
	outcomeMint: string | null | undefined,
) {
	const api = usePrivateApiClient();

	return useQuery<number>({
		queryKey: ["dflow-outcome-balance", solanaAddress ?? null, outcomeMint ?? null],
		enabled: Boolean(solanaAddress) && Boolean(outcomeMint),
		staleTime: 10_000,
		queryFn: async () => {
			if (!solanaAddress || !outcomeMint) return 0;

			const rows = await api.postDflowTokenBalances(solanaAddress, [outcomeMint.trim()]);
			const row = rows.find((r) => r.mint.trim() === outcomeMint.trim());
			return row?.balance ?? 0;
		},
	});
}
