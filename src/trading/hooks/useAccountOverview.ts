import { useQuery } from "@tanstack/react-query";
import { PrivateApiError } from "@/services/privateApi/errors";
import { usePrivateApiClient } from "./usePrivateApiClient";
import { tradingQueryKeys } from "@/trading/queryKeys";
import type { AccountOverview } from "@/types/trading";

const DISABLED_KEY = ["trading", "accountOverview", "__disabled__"] as const;

export function useAccountOverview(profileId: string | undefined) {
	const api = usePrivateApiClient();

	return useQuery({
		queryKey: profileId
			? tradingQueryKeys.accountOverview(profileId)
			: DISABLED_KEY,
		enabled: Boolean(profileId),
		queryFn: async (): Promise<AccountOverview> => {
			try {
				return await api.getAccountOverview(profileId as string);
			} catch (e) {
				if (e instanceof PrivateApiError && e.status === 404) {
					return {
						venues: [],
						_clientAccountOverviewNotFound: true,
					};
				}
				throw e;
			}
		},
	});
}
