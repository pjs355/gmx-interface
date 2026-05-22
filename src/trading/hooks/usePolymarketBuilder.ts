import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PrivateApiError } from "@/services/privateApi/errors";
import { usePrivateApiClient } from "./usePrivateApiClient";
import { tradingQueryKeys } from "@/trading/queryKeys";
import type {
	PolymarketAccountResponse,
	PolymarketBuilderSignBody,
	PolymarketL2CredentialsBody,
	PolymarketSyncBody,
	PolymarketVerifyOnChainBody,
} from "@/types/trading";

type UsePolymarketBuilderOptions = {
	enabled?: boolean;
	profileId?: string;
};

export type PolymarketBuilderBundle = ReturnType<typeof usePolymarketBuilder>;

export function usePolymarketBuilder(options: UsePolymarketBuilderOptions = {}) {
	const { enabled = true, profileId } = options;
	const api = usePrivateApiClient();
	const qc = useQueryClient();

	const accountQuery = useQuery({
		queryKey: tradingQueryKeys.polymarketAccount,
		enabled,
		queryFn: async (): Promise<PolymarketAccountResponse> => {
			try {
				return await api.getPolymarketAccount();
			} catch (e) {
				/* Many backends return 404 when no Polymarket row exists yet — treat as empty, not a hard error */
				if (e instanceof PrivateApiError && e.status === 404) {
					return { _clientPolymarketAccountNotFound: true };
				}
				throw e;
			}
		},
	});

	const sync = useMutation({
		mutationFn: (body: PolymarketSyncBody) => api.postPolymarketSync(body),
		onSuccess: async () => {
			await qc.invalidateQueries({
				queryKey: tradingQueryKeys.polymarketAccount,
			});
			if (profileId) {
				await qc.invalidateQueries({
					queryKey: tradingQueryKeys.accountOverview(profileId),
				});
			}
		},
	});

	const verifyOnChain = useMutation({
		mutationFn: (body?: PolymarketVerifyOnChainBody) =>
			api.postPolymarketVerifyOnChain(body ?? {}),
		onSuccess: async () => {
			await qc.invalidateQueries({
				queryKey: tradingQueryKeys.polymarketAccount,
			});
			if (profileId) {
				await qc.invalidateQueries({
					queryKey: tradingQueryKeys.accountOverview(profileId),
				});
			}
		},
	});

	const l2Credentials = useMutation({
		mutationFn: (body: PolymarketL2CredentialsBody) =>
			api.postPolymarketL2Credentials(body),
		onSuccess: async () => {
			await qc.invalidateQueries({
				queryKey: tradingQueryKeys.polymarketAccount,
			});
			if (profileId) {
				await qc.invalidateQueries({
					queryKey: tradingQueryKeys.accountOverview(profileId),
				});
			}
		},
	});

	const builderSign = useMutation({
		mutationFn: (body: PolymarketBuilderSignBody) =>
			api.postPolymarketBuilderSign(body),
	});

	const requiredNextAction = accountQuery.data?.requiredNextAction ?? null;

	return {
		...accountQuery,
		requiredNextAction,
		sync,
		verifyOnChain,
		l2Credentials,
		builderSign,
	};
}
