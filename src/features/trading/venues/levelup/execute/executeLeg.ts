import { encodeFunctionData, erc20Abi, formatUnits } from "viem";
import { base } from "viem/chains";
import { getUSDCAddress } from "@/config/addresses";
import { userMessage, SOR_NO_WALLET, SOR_MISSING_LEVELUP_QUESTION } from "@/errors";
import type { TradeExecutionParams } from "@/features/trading/trade-box/types";
import { levelUpBuyTotalMicroScwBalanceRequired } from "@/features/trading/fees/levelUp";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/features/trading/chains/waitPrivyBaseTxReceipt";
import type { SorLegResult } from "@/features/trading/sor/execute/types";
import type { VenueLegDispatchInput } from "@/features/trading/sor/execute/venueLegContext";
import { runSorTokenApprovalsGate } from "@/features/trading/sor/execute/runSorTokenApprovalsGate";
import {
	readBaseEmbeddedUsdcBalanceRaw,
	readBaseScwUsdcBalanceRaw,
} from "@/features/trading/sor/prefund/fundingStableBalances";
import {
	SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
	SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
} from "@/features/trading/sor/prefund/sorBridgeWallTimeBudget";
import { predictionBuyMakerMicroUsdc } from "@/features/trading/sor/prefund/predictionBuyCollateralMicro";
import { resolveLevelUpSigningPrice } from "@/features/trading/venues/levelup/execute/levelUpSorSigning";
import { createPrivyEmbeddedSendTransactionCapable } from "@/features/trading/venues/polymarket/wallet/embeddedPrivyViemSend";
import { withTimeout } from "@/shared/async/withTimeout";

export async function executeLeg(input: VenueLegDispatchInput): Promise<SorLegResult> {
	const {
		leg,
		side,
		fundingAddresses,
		isLimit,
		limitPrice,
		deps,
		reportSorExecutionPhase,
		privyEvmSendTransaction,
	} = input;

	const { account, ensureTokenApprovals, market, tradeExecutionService } = deps;

	if (!account) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_NO_WALLET),
		};
	}
	const scw = fundingAddresses.baseSmartWallet;
	const approvalErr = await runSorTokenApprovalsGate({
		ensureTokenApprovals,
		venue: "levelup",
		reportSorExecutionPhase,
	});
	if (approvalErr) {
		return {
			filled: false,
			filledShares: 0,
			error: approvalErr,
		};
	}
	const questionId = leg.venueMarketIds.levelUpQuestionId;
	if (!questionId) {
		return {
			filled: false,
			filledShares: 0,
			error: userMessage(SOR_MISSING_LEVELUP_QUESTION),
		};
	}

	const position: "yes" | "no" = leg.outcome === "A" ? "yes" : "no";
	const shares = Math.floor(leg.shares);
	const signingPrice = resolveLevelUpSigningPrice({
		leg,
		side,
		isLimit,
		limitPrice,
	});

	/**
	 * LevelUp `POST /orders` uses the **Base SCW as maker** — API balance checks
	 * are on SCW USDC only. SOR buy legs with `bridge: null` never run
	 * `executeBridge`, so no Li.FI prefund runs to move USDC onto the SCW.
	 * If the SCW is short but the user also holds USDC on the **embedded EOA on
	 * Base** (same chain), we `transfer` that USDC to the SCW before signing.
	 * This is a funding convenience only; venue trading identity stays the SCW.
	 */
	if (side === "buy") {
		const embeddedTrim = fundingAddresses.embeddedEoa;
		const scwLc = scw.toLowerCase();
		if (embeddedTrim.toLowerCase() !== scwLc) {
			const makerMicro = predictionBuyMakerMicroUsdc(shares, signingPrice);
			/** SCW must cover signed `makerAmount` + LevelUp buy fee (FeeWrapper); see API `ensureUsdcApprovalAndBalance`. */
			const requiredMicro = levelUpBuyTotalMicroScwBalanceRequired(makerMicro);
			let scwBal = await readBaseScwUsdcBalanceRaw(scw);
			let embBal = 0n;
			if (scwBal < requiredMicro) {
				embBal = await readBaseEmbeddedUsdcBalanceRaw(embeddedTrim);
				const shortfall = requiredMicro - scwBal;
				const sendMicro = shortfall <= embBal ? shortfall : embBal;
				if (sendMicro > 0n) {
					reportSorExecutionPhase("moving_funds");
					try {
						console.debug("[SOR][prefund] same-chain Base USDC (embedded → SCW for LevelUp)", {
							venue: "levelup",
							usdcApprox: Number(sendMicro) / 1e6,
						});
						const embeddedTx = createPrivyEmbeddedSendTransactionCapable(
							embeddedTrim as `0x${string}`,
							base,
							privyEvmSendTransaction,
						);
						const usdcAddr = getUSDCAddress() as `0x${string}`;
						const data = encodeFunctionData({
							abi: erc20Abi,
							functionName: "transfer",
							args: [scw as `0x${string}`, sendMicro],
						});
						const sent = await withTimeout(
							embeddedTx.sendTransaction({
								to: usdcAddr,
								data,
								value: 0n,
								chainId: base.id,
							}),
							SOR_BASE_USDC_TRANSFER_TIMEOUT_MS,
							"Base USDC transfer (embedded EOA → smart wallet for LevelUp)",
						);
						const hash = parsePrivyEvmTxHash(sent);
						await withTimeout(
							waitForBaseTransactionSuccess(hash, "USDC transfer embedded → smart wallet"),
							SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS,
							"USDC transfer receipt embedded → smart wallet",
						);
					} finally {
						reportSorExecutionPhase("executing_trade");
					}
					scwBal = await readBaseScwUsdcBalanceRaw(scw);
				}
			}
			if (scwBal < requiredMicro) {
				const needHuman = Number(formatUnits(requiredMicro, 6));
				const haveHuman = Number(formatUnits(scwBal, 6));
				const embHuman = Number(formatUnits(embBal, 6));
				return {
					filled: false,
					filledShares: 0,
					error:
						`Insufficient USDC on your Base smart wallet for this LevelUp buy (~$${needHuman.toFixed(2)} required). ` +
						`After moving funds from your embedded wallet on Base, the smart wallet has ~$${haveHuman.toFixed(2)} ` +
						`(embedded Base USDC available to move was ~$${embHuman.toFixed(2)}). ` +
						"Add USDC on Base to your smart wallet or embedded wallet, refresh, and try again.",
				};
			}
		}
	}

	const params: TradeExecutionParams = {
		marketId: questionId,
		position,
		amount: shares,
		price: signingPrice,
		orderType: isLimit ? "limit" : "market",
		side,
		userAddress: scw,
		market,
	};

	const result = await tradeExecutionService.executeTrade(params, null);
	return {
		filled: result.success,
		filledShares: result.success ? shares : 0,
		txHash: result.transactionHash,
		error: result.error,
	};
}
