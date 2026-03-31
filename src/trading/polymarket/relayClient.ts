import { RelayClient, RelayerTxType } from "@polymarket/builder-relayer-client";
import type { WalletClient } from "viem";
import type { GetToken } from "@/services/privateApi/client";
import { createLevelUpBuilderConfig } from "./levelUpBuilderConfig";

const POLYGON = 137;

export async function createPolymarketRelayClient(
	relayerUrl: string,
	walletClient: WalletClient,
	getToken: GetToken
): Promise<RelayClient> {
	const trimmed = relayerUrl.replace(/\/?$/, "");
	const builderConfig = await createLevelUpBuilderConfig(getToken);
	return new RelayClient(
		trimmed,
		POLYGON,
		walletClient as ConstructorParameters<typeof RelayClient>[2],
		builderConfig as unknown as ConstructorParameters<typeof RelayClient>[3],
		RelayerTxType.SAFE
	);
}

export { POLYGON as POLYGON_CHAIN_ID };
