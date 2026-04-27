import type {
	RelayClient,
	RelayerTransaction,
	RelayerTransactionResponse,
} from "@polymarket/builder-relayer-client";
import { deriveSafe } from "@polymarket/builder-relayer-client/dist/builder/derive";
import {
	buildPolymarketApprovalTransactions,
	checkPolymarketApprovals,
} from "./approvalTxs";

/**
 * Gnosis Safe `GS026` / `GS025` (see safe-smart-account `docs/error_codes.md`): signature
 * bytes do not correspond to valid owners **or** the EIP-712 hash was built with a **nonce
 * that no longer matches the Safe** (stale Polymarket `/nonce` vs chain, or concurrent Safe txs).
 */
export const POLYGON_POLYMARKET_SAFE_RELAY_GS_HINT =
	"If Polygonscan shows GS026 or GS025: the Safe rejected the relay signature (often a stale relay nonce vs on-chain Safe nonce, or two Polygon Safe spends at once). Wait a few seconds and retry once; avoid parallel bridges from the same Polymarket Safe.";

/** `waitRelay` throws this substring when the relayer reports STATE_FAILED after mining. */
const POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL =
	"Polymarket Safe relay transaction reverted on-chain";

/**
 * Whether a failed Polygon Polymarket relay + LI.FI attempt is worth **one automatic retry**
 * (fresh `/nonce` + re-sign). Only for full on-chain reverts — not timeouts (ambiguous).
 */
export function isPolymarketSafeRelayOnchainRevert(err: unknown): boolean {
	const m = err instanceof Error ? err.message : String(err);
	return m.includes(POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL);
}

/**
 * Waits for a relayer response to reach a terminal state.
 * Returns the transaction hash if available.
 *
 * `resp.wait()` uses a fixed poll budget (~100 × 2s). On failure it returns `undefined`
 * even when the relayer already knows `STATE_FAILED` — we call `getTransaction()` so
 * users see **revert vs timeout** instead of a single generic error.
 */
export async function waitRelay(resp: RelayerTransactionResponse): Promise<string | undefined> {
	const mined = await resp.wait();
	if (mined) {
		return mined.transactionHash || resp.transactionHash || undefined;
	}

	let last: RelayerTransaction | undefined;
	try {
		const txs = await resp.getTransaction();
		if (txs?.length) last = txs[0];
	} catch {
		/* relayer list may be empty transiently */
	}

	if (last?.state === "STATE_FAILED") {
		const h =
			last.transactionHash?.trim() ||
			resp.transactionHash?.trim() ||
			resp.hash?.trim() ||
			"";
		const explorer = h ? ` On Polygon, inspect tx ${h} on a block explorer.` : "";
		throw new Error(
			h
				? `${POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL} (tx ${h}).${explorer} Common causes: insufficient USDC in the Safe for this LI.FI leg, route/slippage mismatch, missing router approval, or Gnosis Safe GS026/GS025 (signature / relay nonce). ${POLYGON_POLYMARKET_SAFE_RELAY_GS_HINT}`
				: `${POLYGON_RELAY_ONCHAIN_REVERT_SENTINEL} (STATE_FAILED). ${POLYGON_POLYMARKET_SAFE_RELAY_GS_HINT}`,
		);
	}

	const submitted = resp.transactionHash?.trim() || resp.hash?.trim() || "";
	throw new Error(
		submitted
			? `Polymarket relayer did not reach a mined confirmation within its poll window (submitted tx ${submitted}). The tx may still confirm — check Polygonscan; if it stays pending, retry the bridge when the network is calmer.`
			: "Polymarket relayer timed out before returning a confirmed transaction hash.",
	);
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
