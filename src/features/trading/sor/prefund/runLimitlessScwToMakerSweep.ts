import { encodeFunctionData, erc20Abi } from "viem";
import { base } from "viem/chains";
import { userMessage, LIFI_NO_WALLET_CLIENT, LIFI_SCW_LIMITLESS_SWEEP_NOT_PLANNED } from "@/errors";
import type { AccountWalletRoles } from "@/context/accountWallets";
import type { SorVenue } from "@/features/trading/sor/core/sor-types";
import type { UseSorLegExecutorDeps } from "@/features/trading/sor/execute/deps";
import {
	SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
	SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
} from "@/features/trading/sor/prefund/sorBridgeWallTimeBudget";
import { getUSDCAddress } from "@/config/addresses";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/features/trading/chains/waitPrivyBaseTxReceipt";
import { withTimeout } from "@/shared/async/withTimeout";

export async function runLimitlessScwToMakerSweep(opts: {
	fundingAddresses: AccountWalletRoles;
	plannedSweepMicros: bigint;
	getClientForChain: UseSorLegExecutorDeps["getClientForChain"];
	venue: SorVenue;
}): Promise<string> {
	const { fundingAddresses, plannedSweepMicros, getClientForChain, venue } = opts;
	if (plannedSweepMicros === 0n) {
		throw new Error(userMessage(LIFI_SCW_LIMITLESS_SWEEP_NOT_PLANNED));
	}
	const makerAddr = fundingAddresses.limitlessMakerBase as `0x${string}`;
	const usdcAddr = getUSDCAddress() as `0x${string}`;
	const data = encodeFunctionData({
		abi: erc20Abi,
		functionName: "transfer",
		args: [makerAddr, plannedSweepMicros],
	});
	const baseClient = await getClientForChain({ id: base.id });
	if (!baseClient?.sendTransaction) {
		throw new Error(userMessage(LIFI_NO_WALLET_CLIENT));
	}
	console.debug("[SOR][prefund] same-chain Base USDC (SCW → Limitless maker)", {
		venue,
		usdcApprox: Number(plannedSweepMicros) / 1e6,
	});
	const sent = await withTimeout(
		baseClient.sendTransaction({
			to: usdcAddr,
			data,
			value: 0n,
			chainId: base.id,
		}),
		SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
		"Base USDC transfer (SCW → Limitless maker)",
	);
	const hash = parsePrivyEvmTxHash(sent);
	await withTimeout(
		waitForBaseTransactionSuccess(hash, "USDC transfer smart wallet → Limitless maker"),
		SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
		"Base USDC transfer receipt (SCW → Limitless maker)",
	);
	return hash;
}
