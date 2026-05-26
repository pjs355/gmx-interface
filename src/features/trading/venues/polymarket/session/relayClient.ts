import { RelayClient } from "@polymarket/builder-relayer-client";
import type { WalletClient } from "viem";
import type { GetToken } from "@/services/privateApi/client";
import { createRelayRemoteBuilderConfig } from "../trade/levelUpBuilderConfig";

const POLYGON = 137;

/**
 * Build a Polymarket `RelayClient` for the embedded Privy EOA on Polygon.
 *
 * The constructor's optional `relayTxType` arg only affects the legacy Safe
 * `execute` / `deploy` paths, which we no longer call — every relayer
 * interaction goes through `deployDepositWallet` / `executeDepositWalletBatch`
 * which carry their own `WALLET-CREATE` / `WALLET` transaction types
 * internally. We therefore omit the arg entirely.
 */
export async function createPolymarketRelayClient(
	relayerUrl: string,
	walletClient: WalletClient,
	getToken: GetToken,
): Promise<RelayClient> {
	const trimmed = relayerUrl.replace(/\/?$/, "");
	const builderConfig = await createRelayRemoteBuilderConfig(getToken);
	return new RelayClient(
		trimmed,
		POLYGON,
		walletClient as ConstructorParameters<typeof RelayClient>[2],
		builderConfig as unknown as ConstructorParameters<typeof RelayClient>[3],
	);
}

export { POLYGON as POLYGON_CHAIN_ID };
