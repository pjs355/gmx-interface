import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { RelayClient } from "@polymarket/builder-relayer-client";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { createPolymarketRelayClient } from "./relayClient";
import { usePolymarketEoaWalletClient } from "./usePolymarketEoaWalletClient";

export type UsePolymarketRelayResult = {
	getRelayClient: () => Promise<RelayClient | null>;
	relayerUrl: string | undefined;
	walletReady: boolean;
	walletError: string | null;
	eoaAddress: `0x${string}` | undefined;
	polymarketLoading: boolean;
};

/**
 * Polymarket builder relayer (Safe) — embedded EOA signer + server-side builder HMAC.
 * Builds a new RelayClient each time so BuilderConfig embeds a fresh Privy JWT for
 * POST /polymarket/builder/sign (a cached client would reuse an expired token).
 */
export function usePolymarketRelay(): UsePolymarketRelayResult {
	const { getAccessToken } = usePrivy();
	const profileQuery = useCurrentProfile();
	const profileId = profileQuery.data?._id;
	const poly = usePolymarketBuilder({
		profileId,
		enabled: Boolean(profileId),
	});
	const eoa = usePolymarketEoaWalletClient();

	const relayerUrlRaw = poly.data?.relayerUrl;
	const relayerUrl =
		typeof relayerUrlRaw === "string" && relayerUrlRaw.startsWith("http")
			? relayerUrlRaw
			: "https://relayer-v2.polymarket.com";

	const getRelayClient = useCallback(async (): Promise<RelayClient | null> => {
		if (!eoa.walletClient) return null;
		const tokenFn =
			typeof getAccessToken === "function"
				? getAccessToken
				: async () => null;

		return createPolymarketRelayClient(relayerUrl, eoa.walletClient, tokenFn);
	}, [eoa.walletClient, getAccessToken, relayerUrl]);

	return {
		getRelayClient,
		relayerUrl,
		walletReady: eoa.ready,
		walletError: eoa.error,
		eoaAddress: eoa.address,
		polymarketLoading: poly.isLoading,
	};
}
