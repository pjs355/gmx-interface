import { createPublicClient, fallback, http } from "viem";
import { base } from "viem/chains";
import { RPC_URLS } from "@/config/rpc";

/** Match `limitlessTradingApprovalsOnBase` — public Base first for browser-safe JSON-RPC. */
const baseReadRpcUrls: readonly string[] = [
	RPC_URLS.BASE_PUBLIC,
	RPC_URLS.BASE_PUBLIC_NODE,
	RPC_URLS.BASE_INFURA,
	RPC_URLS.BASE_COINBASE,
];

const basePublicClient = createPublicClient({
	chain: base,
	transport: fallback(
		baseReadRpcUrls.map((url) => http(url)),
		{ retryCount: 1, name: "base-tx-receipt" },
	),
});

/**
 * Normalizes Privy / viem smart-wallet `sendTransaction` return values to an
 * `0x…` tx hash for receipt polling.
 */
export function parsePrivyEvmTxHash(res: unknown): `0x${string}` {
	const hash =
		typeof res === "string"
			? res
			: typeof res === "object" && res && "hash" in res
				? String((res as { hash?: string }).hash ?? "")
				: "";
	if (!hash.startsWith("0x") || hash.length < 66) {
		throw new Error("Transaction did not return a valid EVM transaction hash.");
	}
	return hash as `0x${string}`;
}

/**
 * Waits until the tx is included with one confirmation and `status === success`.
 */
export async function waitForBaseTransactionSuccess(
	hash: `0x${string}`,
	errorDetail?: string,
): Promise<void> {
	const receipt = await basePublicClient.waitForTransactionReceipt({
		hash,
		confirmations: 1,
	});
	if (receipt.status !== "success") {
		const suffix = errorDetail?.trim() ? ` ${errorDetail.trim()}` : "";
		throw new Error(`Transaction reverted on Base (hash ${hash.slice(0, 14)}…).${suffix}`);
	}
}
