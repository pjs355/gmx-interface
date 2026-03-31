import { usePrivy } from "@privy-io/react-auth";
import { useMemo } from "react";
import { createPrivateApiClient } from "@/services/privateApi";

export function usePrivateApiClient() {
	const { getAccessToken } = usePrivy();
	return useMemo(
		() =>
			createPrivateApiClient(async () => {
				if (typeof getAccessToken !== "function") return null;
				return getAccessToken();
			}),
		[getAccessToken]
	);
}
