import type { RelayClient, RelayerTransactionResponse } from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import {
	buildPolymarketApprovalTransactions,
	checkPolymarketApprovals,
} from "./approvalTxs";

/**
 * Waits for a relayer response to reach a terminal state.
 * Returns the transaction hash if available.
 */
export async function waitRelay(resp: RelayerTransactionResponse): Promise<string | undefined> {
	const mined = await resp.wait();
	if (!mined || mined.state === "STATE_FAILED") {
		throw new Error(
			`Relayer transaction failed or timed out (state: ${mined?.state ?? "unknown"})`
		);
	}
	return mined.transactionHash || resp.transactionHash || undefined;
}

/** Deploy Safe if not already deployed (gasless via Polymarket relayer). */
export async function deployPolymarketSafeIfNeeded(
	client: RelayClient,
	signerAddress: `0x${string}`
): Promise<boolean> {
	const factory = client.contractConfig.SafeContracts.SafeFactory;
	const safe = deriveSafe(signerAddress, factory);
	if (await client.getDeployed(safe)) return false;
	const resp = await client.deploy();
	await waitRelay(resp);
	return true;
}

/** One batched relay execute for all Polymarket USDC.e + ERC-1155 approvals. */
export async function executePolymarketApprovalBatch(
	client: RelayClient,
	safeAddress: string
): Promise<void> {
	const status = await checkPolymarketApprovals(safeAddress);
	if (status.allApproved) return;
	const txs = buildPolymarketApprovalTransactions();
	const resp = await client.execute(txs, "LevelUp Polymarket approvals");
	await waitRelay(resp);
}
