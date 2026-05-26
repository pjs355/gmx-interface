import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import { userService } from "@/services/api/userService";
import { tradingQueryKeys } from "@/features/trading/queryKeys";

type UseCurrentProfileOptions = {
	enabled?: boolean;
};

export function useCurrentProfile(opts?: UseCurrentProfileOptions) {
	const { authenticated, getAccessToken, user } = usePrivy();
	const { identityToken } = useIdentityToken();
	const externalEnabled = opts?.enabled ?? true;

	return useQuery({
		queryKey: tradingQueryKeys.profileMe,
		enabled:
			externalEnabled && Boolean(authenticated && user && typeof getAccessToken === "function"),
		queryFn: async () => {
			const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
			if (!token) throw new Error("Missing access token");
			return userService.getUserProfile(token, identityToken ?? undefined);
		},
	});
}
