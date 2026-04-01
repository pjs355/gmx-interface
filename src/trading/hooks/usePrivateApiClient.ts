import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useMemo } from "react";
import { createPrivateApiClient } from "@/services/privateApi";

export function usePrivateApiClient() {
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();
	return useMemo(
		() =>
			createPrivateApiClient(
				async () => {
					if (typeof getAccessToken !== "function") return null;
					return getAccessToken();
				},
				() => identityToken ?? undefined
			),
		[getAccessToken, identityToken]
	);
}
