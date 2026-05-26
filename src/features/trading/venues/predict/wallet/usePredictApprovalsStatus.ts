import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";

export function usePredictApprovalsStatus(
	user: string | undefined | null,
	isNegRisk: boolean,
	isYieldBearing: boolean,
	enabled: boolean,
) {
	const api = usePrivateApiClient();
	const addr = user?.startsWith("0x") ? user.trim() : undefined;

	return useQuery({
		queryKey: ["predict-approvals", addr?.toLowerCase() ?? null, isNegRisk, isYieldBearing],
		enabled: Boolean(enabled && addr),
		staleTime: 15_000,
		queryFn: async () => {
			const result = await api.postChainRead({
				venue: "predict",
				kind: "approvals",
				walletAddress: addr!,
				isNegRisk,
				isYieldBearing,
			});
			return result.ok;
		},
		meta: { errorMessage: "Predict approvals" },
	});
}
